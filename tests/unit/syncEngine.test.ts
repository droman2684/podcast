import { describe, it, expect } from 'vitest'
import {
  createLedgerStore,
  pullAndMerge,
  subscribeRealtime,
  createOutbox,
  markerFromUpdatedAt,
  markerFromRev,
  type SyncStorageAdapter
} from '../../src/shared/sync/engine'
import type { TableDescriptor, SyncRow } from '../../src/shared/sync/tables'
import type { SyncClient, RealtimeChannelLike, PostgrestThenable } from '../../src/shared/sync/supabaseLike'

function memoryStorage(): SyncStorageAdapter {
  const store = new Map<string, string>()
  return {
    async getItem(key) {
      return store.has(key) ? store.get(key)! : null
    },
    async setItem(key, value) {
      store.set(key, value)
    }
  }
}

interface EmittingChannel extends RealtimeChannelLike {
  _emit: (payload: { new?: Record<string, unknown> }) => void
}

function fakeClient(tableRows: Record<string, Record<string, unknown>[]>) {
  const upsertCalls: { table: string; row: Record<string, unknown> }[] = []
  const channels: Record<string, EmittingChannel> = {}
  const client: SyncClient = {
    from(table) {
      const rows = tableRows[table] ?? []
      return {
        select(_columns: string) {
          let filtered = rows
          const builder = {
            eq(col: string, val: unknown) {
              filtered = filtered.filter((r) => r[col] === val)
              return builder
            },
            is(col: string, val: null) {
              filtered = filtered.filter((r) => r[col] === val)
              return builder
            },
            range(from: number, to: number) {
              return Promise.resolve({ data: filtered.slice(from, to + 1), error: null, count: filtered.length })
            },
            maybeSingle() {
              return Promise.resolve({ data: filtered[0] ?? null, error: null })
            },
            then(onFulfilled: (v: unknown) => unknown) {
              return Promise.resolve({ data: filtered, error: null, count: filtered.length }).then(onFulfilled)
            }
          }
          return builder as unknown as PostgrestThenable<Record<string, unknown>>
        },
        upsert(row: Record<string, unknown> | Record<string, unknown>[]) {
          const single = Array.isArray(row) ? row[0] : row
          upsertCalls.push({ table, row: single })
          return Promise.resolve({ data: [single], error: null })
        }
      }
    },
    channel(name: string) {
      const handlers: Array<(payload: { new?: Record<string, unknown> }) => void> = []
      const chan: EmittingChannel = {
        on(_event, _filter, cb) {
          handlers.push(cb)
          return chan
        },
        subscribe() {
          return chan
        },
        _emit: (payload) => handlers.forEach((h) => h(payload))
      }
      channels[name] = chan
      return chan
    },
    removeChannel() {},
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null })
    }
  }
  return { client, upsertCalls, channels }
}

describe('markerFromUpdatedAt / markerFromRev', () => {
  it('extracts an epoch-ms marker from updated_at', () => {
    expect(markerFromUpdatedAt({ updated_at: '2026-01-01T00:00:00.000Z' })).toBe(
      new Date('2026-01-01T00:00:00.000Z').getTime()
    )
  })
  it('extracts a plain rev marker', () => {
    expect(markerFromRev({ rev: 42 })).toBe(42)
  })
})

describe('pullAndMerge', () => {
  it('applies a row not yet seen and gates out one already known', async () => {
    const rows = [
      { user_id: 'u1', episode_id: 'e1', position_sec: 10, updated_at: '2026-01-01T00:00:00.000Z' },
      { user_id: 'u1', episode_id: 'e2', position_sec: 20, updated_at: '2026-01-02T00:00:00.000Z' }
    ]
    const { client } = fakeClient({ playback_positions: rows })
    const ledger = createLedgerStore(memoryStorage(), 'ledger')
    await ledger.ensureLoaded()
    // e1 already known at a marker >= its row's marker — should be skipped.
    ledger.touch('playbackPosition:e1', new Date('2026-01-01T00:00:00.000Z').getTime())

    const applied: SyncRow[] = []
    const descriptors: TableDescriptor[] = [
      {
        table: 'playback_positions',
        ledgerKey: (r) => `playbackPosition:${(r as unknown as { episode_id: string }).episode_id}`,
        applyRow: (r) => {
          applied.push(r)
        }
      }
    ]
    await pullAndMerge(client, ledger, 'u1', descriptors, markerFromUpdatedAt)
    expect(applied).toHaveLength(1)
    expect((applied[0] as unknown as { episode_id: string }).episode_id).toBe('e2')
  })

  it('routes a tombstoned row to applyTombstone instead of applyRow', async () => {
    const rows = [
      { user_id: 'u1', id: 'p1', deleted_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }
    ]
    const { client } = fakeClient({ podcasts: rows })
    const ledger = createLedgerStore(memoryStorage(), 'ledger')
    const tombstoned: string[] = []
    const applied: string[] = []
    const descriptors: TableDescriptor[] = [
      {
        table: 'podcasts',
        ledgerKey: (r) => `podcast:${(r as unknown as { id: string }).id}`,
        isTombstone: (r) => (r as unknown as { deleted_at: string | null }).deleted_at !== null,
        applyTombstone: (r) => {
          tombstoned.push((r as unknown as { id: string }).id)
        },
        applyRow: (r) => {
          applied.push((r as unknown as { id: string }).id)
        }
      }
    ]
    await pullAndMerge(client, ledger, 'u1', descriptors, markerFromUpdatedAt)
    expect(tombstoned).toEqual(['p1'])
    expect(applied).toEqual([])
  })

  it('reads a singleton table via maybeSingle rather than paging', async () => {
    const { client } = fakeClient({ queue: [{ user_id: 'u1', episode_ids: ['e1', 'e2'], updated_at: '2026-01-01T00:00:00.000Z' }] })
    const ledger = createLedgerStore(memoryStorage(), 'ledger')
    let received: string[] | null = null
    const descriptors: TableDescriptor[] = [
      {
        table: 'queue',
        ledgerKey: () => 'queue',
        singleton: true,
        applyRow: (r) => {
          received = (r as unknown as { episode_ids: string[] }).episode_ids
        }
      }
    ]
    await pullAndMerge(client, ledger, 'u1', descriptors, markerFromUpdatedAt)
    expect(received).toEqual(['e1', 'e2'])
  })
})

describe('subscribeRealtime', () => {
  it('applies an incoming row through the same ledger gate as a pull', async () => {
    const { client, channels } = fakeClient({})
    const ledger = createLedgerStore(memoryStorage(), 'ledger')
    await ledger.ensureLoaded()
    const applied: number[] = []
    const descriptors: TableDescriptor[] = [
      {
        table: 'playback_positions',
        ledgerKey: (r) => `playbackPosition:${(r as unknown as { episode_id: string }).episode_id}`,
        applyRow: (r) => {
          applied.push((r as unknown as { position_sec: number }).position_sec)
        }
      }
    ]
    const unsubscribe = subscribeRealtime(client, ledger, 'u1', descriptors, markerFromUpdatedAt)
    channels['rt-playback_positions-u1']._emit({
      new: { episode_id: 'e1', position_sec: 55, updated_at: '2026-01-01T00:00:00.000Z' }
    })
    expect(applied).toEqual([55])

    // A second, staler event for the same key must be gated out, exactly
    // like a stale pull would be.
    channels['rt-playback_positions-u1']._emit({
      new: { episode_id: 'e1', position_sec: 1, updated_at: '2025-01-01T00:00:00.000Z' }
    })
    expect(applied).toEqual([55])
    unsubscribe()
  })
})

describe('createOutbox', () => {
  it('drops a pending write from storage once it succeeds', async () => {
    const { client, upsertCalls } = fakeClient({})
    const storage = memoryStorage()
    const outbox = createOutbox(client, storage, 'outbox')
    await outbox.enqueue('playback_positions', 'playbackPosition:e1', { user_id: 'u1', episode_id: 'e1', position_sec: 10 })
    expect(upsertCalls).toHaveLength(1)
    const raw = await storage.getItem('outbox')
    expect(JSON.parse(raw!)).toEqual({})
  })

  it('keeps a failed write pending and retries it on drain()', async () => {
    let fail = true
    const client: SyncClient = {
      from: (_table) => ({
        select: () => {
          throw new Error('not used')
        },
        upsert: (row) => {
          if (fail) return Promise.resolve({ data: null, error: { message: 'network request failed' } })
          return Promise.resolve({ data: [Array.isArray(row) ? row[0] : row], error: null })
        }
      }),
      channel: () => {
        throw new Error('not used')
      },
      removeChannel: () => {},
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
        signOut: async () => ({ error: null })
      }
    }
    const storage = memoryStorage()
    const outbox = createOutbox(client, storage, 'outbox')
    // enqueue() never rejects, even when the first attempt fails — the
    // write is durably queued and drain() is what retries it.
    await outbox.enqueue('playback_positions', 'playbackPosition:e1', { user_id: 'u1', episode_id: 'e1', position_sec: 10 })
    let raw = await storage.getItem('outbox')
    expect(Object.keys(JSON.parse(raw!))).toEqual(['playbackPosition:e1'])

    fail = false
    await outbox.drain()
    raw = await storage.getItem('outbox')
    expect(JSON.parse(raw!)).toEqual({})
  })
})
