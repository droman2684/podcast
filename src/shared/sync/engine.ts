import type { SyncClient } from './supabaseLike'
import { withAuthRetry } from './authRetry'
import { isRemoteNewer, touch, revert, type SyncLedger } from './ledger'
import { fetchAllRows } from './paging'
import type { TableDescriptor, SyncRow } from './tables'

// The only per-platform seams — everything else in this file is one real
// implementation both mobile and desktop call into. See the doc comment in
// supabaseLike.ts for why `client` is a structural type rather than an
// import of the real supabase-js package.
export interface SyncStorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export interface NetworkStatusAdapter {
  isOnline(): boolean
  onChange(callback: (online: boolean) => void): () => void
}

export interface ForegroundAdapter {
  onForeground(callback: () => void): () => void
}

export interface SyncAdapters {
  client: SyncClient
  storage: SyncStorageAdapter
  network: NetworkStatusAdapter
  foreground: ForegroundAdapter
  intervalMs: number
}

// A row's ordering marker — new Date(row.updated_at).getTime() until the
// `rev` column migration ships, then row.rev. Passed in by the caller
// (rather than fixed here) so both apps switch on the same client release
// that also bumps the ledger storage version — see supabase-schema.sql's
// migration notes on why doing this out of order is unsafe.
export type MarkerOf<Row> = (row: Row) => number

export const markerFromUpdatedAt = (row: { updated_at: string }): number => new Date(row.updated_at).getTime()
// rev is optional pre-migration (see supabase-schema.sql) — defaults to 0
// only matters once markerFromRev is actually switched to, at which point
// every real row is guaranteed non-zero by the migration's backfill.
export const markerFromRev = (row: { rev?: number }): number => row.rev ?? 0

async function safeLoad(storage: SyncStorageAdapter, key: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await storage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch (err) {
    console.error(`[sync] failed to load "${key}":`, err)
    return null
  }
}

async function safeSave(storage: SyncStorageAdapter, key: string, value: unknown): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error(`[sync] failed to persist "${key}":`, err)
  }
}

// Wraps the ledger with durable storage and single-flight loading — mirrors
// what mobile's module-scoped syncLedger/ensureSyncLedgerLoaded used to do
// by hand, now shared. A promise (not a boolean flag) guards the load so a
// touch() that fires before the initial read resolves can't be clobbered by
// it landing later.
export interface LedgerStore {
  ensureLoaded(): Promise<void>
  map: SyncLedger
  isNewer(key: string, marker: number | null | undefined): boolean
  touch(key: string, marker?: number): void
  revert(key: string, previousMarker: number | undefined): void
}

export function createLedgerStore(storage: SyncStorageAdapter, storageKey: string): LedgerStore {
  const store: LedgerStore = {
    map: {},
    ensureLoaded: () => loadPromise,
    isNewer: (key, marker) => isRemoteNewer(store.map, key, marker),
    touch: (key, marker) => {
      touch(store.map, key, marker)
      safeSave(storage, storageKey, store.map).catch(() => {})
    },
    revert: (key, previousMarker) => {
      revert(store.map, key, previousMarker)
      safeSave(storage, storageKey, store.map).catch(() => {})
    }
  }
  const loadPromise = (async () => {
    const raw = await safeLoad(storage, storageKey)
    // Merged rather than replaced: a touch() that fires before this read
    // resolves must win over the loaded snapshot, since it's strictly newer.
    if (raw) store.map = { ...(raw as SyncLedger), ...store.map }
  })()
  return store
}

export async function getCurrentUserId(client: SyncClient): Promise<string | null> {
  const { data, error } = await withAuthRetry(client, () => client.auth.getUser())
  if (error) {
    console.error('[sync] getUser() failed — treating as signed out:', error)
    return null
  }
  return data.user?.id ?? null
}

// Pulls every descriptor's table for this user and merges it into local
// state, gating every single row through the ledger uniformly — no table is
// left unprotected (a real gap found in the prior per-platform code, where
// only 3 of 8 mobile tables and an inconsistent subset of desktop tables
// were actually ledger-checked on pull).
export async function pullAndMerge(
  client: SyncClient,
  ledger: LedgerStore,
  userId: string,
  descriptors: TableDescriptor[],
  markerOf: MarkerOf<SyncRow>
): Promise<void> {
  await ledger.ensureLoaded()
  for (const d of descriptors) {
    if (d.singleton) {
      const { data, error } = await withAuthRetry(client, () =>
        client.from(d.table).select('*').eq('user_id', userId).maybeSingle()
      )
      if (error) throw new Error(error.message)
      const row = data as unknown as SyncRow | null
      if (!row) continue
      const key = d.ledgerKey(row)
      const marker = markerOf(row)
      if (!ledger.isNewer(key, marker)) continue
      if (d.isTombstone?.(row)) await d.applyTombstone?.(row)
      else await d.applyRow(row)
      ledger.touch(key, marker)
      continue
    }

    const rawRows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      withAuthRetry(client, () =>
        client.from(d.table).select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
      )
    )
    for (const raw of rawRows) {
      const row = raw as unknown as SyncRow
      const key = d.ledgerKey(row)
      const marker = markerOf(row)
      if (!ledger.isNewer(key, marker)) continue
      if (d.isTombstone?.(row)) await d.applyTombstone?.(row)
      else await d.applyRow(row)
      ledger.touch(key, marker)
    }
  }
}

// Opens one Realtime channel per descriptor — looping the same descriptor
// list used for pulling means every table a platform syncs automatically
// gets live cross-device updates, not just whichever 3 tables someone
// happened to hand-wire before. Requires each table to actually be added to
// the `supabase_realtime` publication (supabase-schema.sql) — otherwise the
// subscription is a silent no-op, same as any Supabase Realtime channel with
// nothing published to it.
export function subscribeRealtime(
  client: SyncClient,
  ledger: LedgerStore,
  userId: string,
  descriptors: TableDescriptor[],
  markerOf: MarkerOf<SyncRow>
): () => void {
  const channels = descriptors.map((d) =>
    client
      .channel(`rt-${d.table}-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: d.table, filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as unknown as SyncRow | undefined
          if (!row) return
          const key = d.ledgerKey(row)
          const marker = markerOf(row)
          if (!ledger.isNewer(key, marker)) return
          ledger.touch(key, marker)
          const applied = d.isTombstone?.(row) ? d.applyTombstone?.(row) : d.applyRow(row)
          Promise.resolve(applied).catch((err) => console.error(`[sync] realtime apply failed for ${key}:`, err))
        }
      )
      .subscribe()
  )
  return () => channels.forEach((c) => client.removeChannel(c))
}

interface PendingWrite {
  key: string
  table: string
  payload: Record<string, unknown>
  queuedAtMs: number
}

export interface Outbox {
  enqueue(table: string, key: string, payload: Record<string, unknown>): Promise<void>
  drain(): Promise<void>
}

// A durable pending-write queue: enqueue() persists before attempting the
// network write, so an app kill/crash mid-write doesn't lose it, and drain()
// retries anything still pending. This is the one piece that replaces both
// mobile's fire-and-forget upserts (previously lost for good on failure —
// only the local-cache *read* fallback existed, nothing re-pushed a failed
// write) and desktop's dirty-timestamp rescan (previously only retried on
// the next full interval, and only because pushDirty happened to re-scan
// everything — schedulePush(), meant to push sooner, was never actually
// called from anywhere).
export function createOutbox(client: SyncClient, storage: SyncStorageAdapter, storageKey: string): Outbox {
  let pending: Record<string, PendingWrite> = {}
  let loaded: Promise<void> | null = null
  const ensureLoaded = (): Promise<void> =>
    (loaded ??= (async () => {
      const raw = await safeLoad(storage, storageKey)
      if (raw) pending = { ...(raw as Record<string, PendingWrite>), ...pending }
    })())
  const persistPending = (): Promise<void> => safeSave(storage, storageKey, pending)

  async function attempt(pw: PendingWrite): Promise<void> {
    const { error } = await withAuthRetry(client, () =>
      client.from(pw.table).upsert({ ...pw.payload, updated_at: new Date().toISOString() })
    )
    if (error) throw new Error(error.message)
    delete pending[pw.key]
  }

  return {
    // Deliberately never rejects on a failed first attempt — the whole
    // point of a durable outbox is that a write which fails (offline, a
    // dropped connection, a momentary auth hiccup) is NOT lost: it stays
    // queued and drain() keeps retrying it. A caller that rolled its
    // optimistic UI state back on rejection here would fight against that —
    // the user would see their edit disappear locally while the outbox
    // silently kept trying to push the very change the UI just discarded.
    // Callers that want to know something's still pending should read
    // outbox state explicitly rather than treat a rejection as "it failed."
    async enqueue(table, key, payload) {
      await ensureLoaded()
      pending[key] = { key, table, payload, queuedAtMs: Date.now() }
      await persistPending()
      try {
        await attempt(pending[key])
      } catch (err) {
        console.error(`[outbox] initial attempt failed for ${key}, will retry:`, err)
      } finally {
        // Whether attempt() succeeded (removed itself from `pending`) or
        // threw (left itself in `pending` for the next drain()), the
        // on-disk copy needs to match in-memory state either way.
        await persistPending()
      }
    },
    async drain() {
      await ensureLoaded()
      for (const pw of Object.values(pending)) {
        try {
          await attempt(pw)
        } catch (err) {
          console.error(`[outbox] retry failed for ${pw.key}:`, err)
        }
      }
      await persistPending()
    }
  }
}

// Wires an outbox to retry automatically: on reconnect, on app foreground,
// and on a periodic interval — so a write made offline or one that failed
// gets flushed without the user needing to manually trigger a resync.
// Separate from createOutbox() so tests can drive enqueue()/drain() directly
// against fake adapters without also standing up network/foreground sources.
export function wireOutboxAutoDrain(outbox: Outbox, adapters: SyncAdapters): () => void {
  const stopNetwork = adapters.network.onChange((online) => {
    if (online) outbox.drain().catch(() => {})
  })
  const stopForeground = adapters.foreground.onForeground(() => {
    outbox.drain().catch(() => {})
  })
  const interval = setInterval(() => {
    outbox.drain().catch(() => {})
  }, adapters.intervalMs)
  return () => {
    stopNetwork()
    stopForeground()
    clearInterval(interval)
  }
}
