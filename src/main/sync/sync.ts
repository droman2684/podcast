import { IPC_CHANNELS } from '@shared/ipcChannels'
import { QUEUE_SORT_MODES, type QueueSortMode } from '@shared/queueView'
import type { Station } from '@shared/types'
import {
  createLedgerStore,
  createOutbox,
  getCurrentUserId,
  markerFromUpdatedAt,
  pullAndMerge as enginePullAndMerge,
  subscribeRealtime as engineSubscribeRealtime,
  wireOutboxAutoDrain,
  type LedgerStore,
  type Outbox
} from '@shared/sync/engine'
import {
  createTableDescriptors,
  type TableDescriptor,
  type SyncRow,
  type PodcastRow,
  type PodcastSettingsRow,
  type StationRow,
  type QueueRow,
  type QueuePrefsRow,
  type PlaybackPositionRow,
  type EpisodePlayedRow,
  type PrivateFeedRow
} from '@shared/sync/tables'
import type { SyncClient } from '@shared/sync/supabaseLike'
import {
  getSnapshot,
  persist,
  touchEpisodes,
  touchSync,
  setSyncHooks,
  VALID_STATION_SORTS,
  type PersistedData,
  type SyncTable
} from '../persistence'
import { subscribe, applyUnsubscribeCascade } from '../subscriptions'
import { getMainWindow } from '../windowRegistry'
import { getSupabase } from './client'
import { createDesktopAdapters } from './adapters'
import { buildRowForKey } from './rowBuilder'

const LEDGER_STORAGE_KEY = 'sync.ledger.v1'
const OUTBOX_STORAGE_KEY = 'sync.outbox.v1'

// A small bound on how many dirty keys get pushed concurrently during a
// full sync cycle (e.g. a first-time backfill of a library that predates
// this device ever turning sync on, which can mean thousands of
// episode_played rows at once) — high enough to not be effectively
// sequential, low enough not to fire thousands of simultaneous requests.
const PUSH_CONCURRENCY = 20

let ledger: LedgerStore | null = null
let outbox: Outbox | null = null
let stopAutoDrain: (() => void) | null = null
let stopRealtime: (() => void) | null = null
let hooksInstalled = false

function client(): SyncClient | null {
  const real = getSupabase()
  return real ? (real as unknown as SyncClient) : null
}

// Applying a pulled/realtime row must not re-mark it dirty for push (that
// would immediately re-push what was just pulled) — touchSync's `fromRemote`
// flag exists exactly for this. Also keeps syncUpdatedAt (still used by
// backfillUntouched/the dirty-scan below) in agreement with the engine's own
// ledger, so a freshly-pulled row is never mistaken for "never synced."
function markAppliedFromRemote(key: string, marker: number): void {
  touchSync(key, marker, true)
}

// Wraps each descriptor so that after a pulled/realtime row is actually
// applied, the local dirty-tracking map learns about it too (see
// markAppliedFromRemote) — done once here rather than duplicated inside
// every one of the callbacks below.
function mirrorIntoSyncUpdatedAt(list: TableDescriptor[]): TableDescriptor[] {
  return list.map((d) => ({
    ...d,
    applyRow: async (row: SyncRow) => {
      await d.applyRow(row)
      markAppliedFromRemote(d.ledgerKey(row), markerFromUpdatedAt(row))
    },
    applyTombstone: d.applyTombstone
      ? async (row: SyncRow) => {
          await d.applyTombstone!(row)
          markAppliedFromRemote(d.ledgerKey(row), markerFromUpdatedAt(row))
        }
      : undefined
  }))
}

function descriptors(snapshot: PersistedData): TableDescriptor[] {
  return createTableDescriptors({
    onPodcastRow: async (row: PodcastRow) => {
      if (!snapshot.podcasts[row.id]) {
        try {
          await subscribe(row.feed_url, row.is_private)
        } catch (err) {
          console.error(`Sync pull: failed to subscribe to ${row.feed_url}:`, err)
          return
        }
      }
      const podcast = snapshot.podcasts[row.id]
      if (podcast) podcast.customArtworkUrl = row.custom_artwork_url ?? null
    },
    onPodcastTombstone: (row: PodcastRow) => {
      if (snapshot.podcasts[row.id]) applyUnsubscribeCascade(row.id)
    },
    onPodcastSettingsRow: (row: PodcastSettingsRow) => {
      snapshot.podcastSettings[row.podcast_id] = { notify: row.notify }
    },
    onStationRow: (row: StationRow) => {
      const station: Station = {
        id: row.id,
        name: row.name ?? 'Untitled Station',
        podcastIds: Array.isArray(row.podcast_ids) ? row.podcast_ids : [],
        sortBy: VALID_STATION_SORTS.has(row.sort_by) ? (row.sort_by as Station['sortBy']) : 'newest',
        episodesPerShow: typeof row.episodes_per_show === 'number' ? row.episodes_per_show : 5
      }
      snapshot.stations[row.id] = station
    },
    onStationTombstone: (row: StationRow) => {
      delete snapshot.stations[row.id]
    },
    onQueueRow: (row: QueueRow) => {
      snapshot.queue = Array.isArray(row.episode_ids) ? row.episode_ids : []
    },
    onQueuePrefsRow: (row: QueuePrefsRow) => {
      const sortMode = QUEUE_SORT_MODES.includes(row.sort_mode as QueueSortMode)
        ? (row.sort_mode as QueueSortMode)
        : 'manual'
      snapshot.queuePrefs = {
        sortMode,
        groupByShow: Boolean(row.group_by_show),
        queueView: row.queue_view === 'grid' ? 'grid' : 'list'
      }
    },
    onPlaybackPositionRow: (row: PlaybackPositionRow) => {
      snapshot.playbackPositions[row.episode_id] = row.position_sec
    },
    onEpisodePlayedRow: (row: EpisodePlayedRow) => {
      const podcastId = row.podcast_id
      const episodes = snapshot.episodesByPodcast[podcastId]
      const idx = episodes?.findIndex((e) => e.id === row.episode_id) ?? -1
      // Podcast/episode not fetched on this device yet — resolves on a
      // later cycle once it exists, nothing to retry explicitly.
      if (!episodes || idx === -1) return
      episodes[idx] = {
        ...episodes[idx],
        played: row.played,
        durationSec: row.duration_sec_override ?? episodes[idx].durationSec
      }
      const podcast = snapshot.podcasts[podcastId]
      if (podcast) podcast.unread = episodes.filter((e) => !e.played).length
      touchEpisodes(podcastId)
    },
    onPrivateFeedRow: (row: PrivateFeedRow) => {
      const existing = snapshot.privateFeeds[row.id]
      snapshot.privateFeeds[row.id] = {
        id: row.id,
        name: row.name ?? existing?.name ?? row.url ?? '',
        url: row.url ?? existing?.url ?? '',
        user: row.feed_user ?? existing?.user ?? '',
        encryptedPassword: existing?.encryptedPassword ?? ''
      }
    },
    onPrivateFeedTombstone: (row: PrivateFeedRow) => {
      delete snapshot.privateFeeds[row.id]
    }
  })
}

interface Engine {
  client: SyncClient
  ledger: LedgerStore
  outbox: Outbox
}

async function ensureEngine(): Promise<Engine | null> {
  const c = client()
  if (!c) return null
  const adapters = createDesktopAdapters(c)
  if (!ledger) ledger = createLedgerStore(adapters.storage, LEDGER_STORAGE_KEY)
  if (!outbox) {
    outbox = createOutbox(c, adapters.storage, OUTBOX_STORAGE_KEY)
    stopAutoDrain?.()
    stopAutoDrain = wireOutboxAutoDrain(outbox, adapters)
  }
  await ledger.ensureLoaded()
  if (!hooksInstalled) {
    hooksInstalled = true
    setSyncHooks({
      onDirty: (key) => {
        void pushKey(key)
      },
      onDelete: (pending) => {
        void pushDelete(pending.table, pending.localId, pending.key)
      }
    })
  }
  return { client: c, ledger, outbox }
}

async function pushKey(key: string): Promise<void> {
  const engine = await ensureEngine()
  if (!engine) return
  const userId = await getCurrentUserId(engine.client)
  if (!userId) return
  const built = buildRowForKey(getSnapshot(), userId, key)
  if (!built) return
  // enqueue() itself never rejects — a failed attempt just stays durably
  // pending for the outbox's own retry (see engine.ts's doc comment).
  await engine.outbox.enqueue(built.table, key, built.row)
}

async function pushDelete(table: SyncTable, localId: string, key: string): Promise<void> {
  const engine = await ensureEngine()
  if (!engine) return
  const userId = await getCurrentUserId(engine.client)
  if (!userId) return
  const nowIso = new Date().toISOString()
  // Handed off to the outbox's own durable retry — syncPendingDeletes (the
  // old durability mechanism) no longer needs to track it once the outbox
  // does, regardless of whether this first attempt actually succeeded.
  await engine.outbox.enqueue(table, key, { user_id: userId, id: localId, deleted_at: nowIso })
  const snapshot = getSnapshot()
  snapshot.syncPendingDeletes = snapshot.syncPendingDeletes.filter((p) => p.key !== key)
}

async function pushKeysWithConcurrency(keys: string[]): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < keys.length) {
      const key = keys[next++]
      await pushKey(key)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, keys.length) }, worker))
}

// Seeds the cloud with anything that exists locally but has no sync
// bookkeeping entry yet — subscriptions made before this device ever turned
// sync on, or a record that ended up untouched some other way.
function backfillUntouched(snapshot: PersistedData): void {
  const dirty = snapshot.syncUpdatedAt
  const touchIfUntouched = (key: string): void => {
    if (!(key in dirty)) touchSync(key)
  }
  for (const id of Object.keys(snapshot.podcasts)) touchIfUntouched(`podcast:${id}`)
  for (const id of Object.keys(snapshot.podcastSettings)) touchIfUntouched(`podcastSettings:${id}`)
  for (const id of Object.keys(snapshot.stations)) touchIfUntouched(`station:${id}`)
  for (const id of Object.keys(snapshot.privateFeeds)) touchIfUntouched(`privateFeed:${id}`)
  for (const episodes of Object.values(snapshot.episodesByPodcast)) {
    for (const episode of episodes) {
      if (episode.played) touchIfUntouched(`episodePlayed:${episode.id}`)
    }
  }
  for (const [episodeId, positionSec] of Object.entries(snapshot.playbackPositions)) {
    if (positionSec > 0) touchIfUntouched(`playbackPosition:${episodeId}`)
  }
  if (snapshot.queue.length > 0) touchIfUntouched('queue')
  if (snapshot.queuePrefs) touchIfUntouched('queuePrefs')
}

export async function pullAndMerge(): Promise<void> {
  const engine = await ensureEngine()
  if (!engine) return
  const userId = await getCurrentUserId(engine.client)
  if (!userId) return
  console.log(`[sync] pull starting for user ${userId}`)
  const snapshot = getSnapshot()
  await enginePullAndMerge(
    engine.client,
    engine.ledger,
    userId,
    mirrorIntoSyncUpdatedAt(descriptors(snapshot)),
    markerFromUpdatedAt
  )
  persist()
  console.log('[sync] pull complete')
}

export function subscribeRealtimeSync(): void {
  ;(async () => {
    const engine = await ensureEngine()
    if (!engine) return
    const userId = await getCurrentUserId(engine.client)
    if (!userId) return
    stopRealtime?.()
    stopRealtime = engineSubscribeRealtime(
      engine.client,
      engine.ledger,
      userId,
      mirrorIntoSyncUpdatedAt(descriptors(getSnapshot())),
      markerFromUpdatedAt
    )
  })().catch((err) => console.error('[sync] failed to subscribe to realtime:', err))
}

export async function pushDirtyAndPendingDeletes(): Promise<void> {
  const engine = await ensureEngine()
  if (!engine) return
  const userId = await getCurrentUserId(engine.client)
  if (!userId) return
  const snapshot = getSnapshot()
  backfillUntouched(snapshot)

  const dirtyKeys = Object.entries(snapshot.syncUpdatedAt)
    .filter(([, updatedAt]) => updatedAt > (snapshot.syncLastPushedAt ?? 0))
    .map(([key]) => key)
  console.log(`[sync] push starting for user ${userId}: ${dirtyKeys.length} dirty key(s), ${snapshot.syncPendingDeletes.length} pending delete(s)`)
  await pushKeysWithConcurrency(dirtyKeys)

  for (const pending of [...snapshot.syncPendingDeletes]) {
    await pushDelete(pending.table, pending.localId, pending.key)
  }

  snapshot.syncLastPushedAt = Date.now()
  persist()
  console.log('[sync] push complete')
}

export async function runSyncCycle(): Promise<void> {
  console.log('[sync] runSyncCycle invoked')
  const win = getMainWindow()
  win?.webContents.send(IPC_CHANNELS.SYNC_STATE_EVENT, {
    phase: 'syncing',
    lastSyncedAt: getSnapshot().syncLastPulledAt
  })
  try {
    await pullAndMerge()
    getSnapshot().syncLastPulledAt = Date.now()
    await pushDirtyAndPendingDeletes()
    subscribeRealtimeSync()
    win?.webContents.send(IPC_CHANNELS.SYNC_STATE_EVENT, {
      phase: 'idle',
      lastSyncedAt: getSnapshot().syncLastPulledAt
    })
  } catch (err) {
    win?.webContents.send(IPC_CHANNELS.SYNC_STATE_EVENT, {
      phase: 'error',
      lastSyncedAt: getSnapshot().syncLastPulledAt,
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
}
