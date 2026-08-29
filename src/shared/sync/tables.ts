import type { QueueSortMode, QueueViewMode } from '../queueView'

// One descriptor per syncable Supabase table. `applyRow`/`applyTombstone`
// are the only place platform-specific "what does this table mean to my
// UI/disk state" logic lives — everything else (pulling, paging, ledger
// gating, realtime wiring, retrying failed pushes) is the same engine code
// on both platforms. See engine.ts.
//
// Deletion is always modeled as an explicit `deleted_at` flag on the row
// itself (never as "the row is simply absent from a filtered select") so a
// delete is handled identically whether it arrives via a full pull or a
// Realtime event — a filtered pull can't tell "deleted" apart from "outside
// this page," and Realtime delivers the row regardless of any column
// filter, so a tombstone flag is the only mechanism that works uniformly
// for both.
// Every syncable row carries a server-stamped `updated_at` (and, after the
// rev-column migration, a `rev`) — the two possible markerOf() sources. Each
// concrete row type (PodcastRow, QueueRow, ...) structurally satisfies this
// via its own `updated_at`/`rev` fields (deliberately no index signature
// here — a plain interface like PodcastRow doesn't structurally satisfy
// Record<string, unknown> in TypeScript even though every one of its fields
// would be a valid value for it, so requiring that would make every
// concrete row type fail this constraint).
export interface SyncRow {
  updated_at: string
  rev?: number
}

export interface TableDescriptor<Row extends SyncRow = SyncRow> {
  table: string
  // Local bookkeeping key for this row — e.g. `podcast:${row.id}`, or a
  // constant for a singleton (one-row-per-account) table.
  ledgerKey: (row: Row) => string
  // True only for tables with no per-record id, keyed by user_id alone
  // (queue, queue_prefs) — changes how the engine queries (.maybeSingle()
  // instead of a paged range) and how a realtime payload is looked up.
  singleton?: boolean
  isTombstone?: (row: Row) => boolean
  // May return a Promise (e.g. desktop's podcast applyRow needs to await an
  // RSS fetch via subscribe() for a podcast this device hasn't seen before)
  // — the engine awaits it before moving to the next row, same as the
  // synchronous case.
  applyTombstone?: (row: Row) => void | Promise<void>
  applyRow: (row: Row) => void | Promise<void>
}

// A descriptor's callbacks are naturally typed against its own specific row
// shape (PodcastRow, QueueRow, ...), but the engine needs one homogeneous
// array to loop over. Function parameters are contravariant, so
// `TableDescriptor<PodcastRow>` isn't structurally assignable to
// `TableDescriptor<SyncRow>` — this wrapper closes over the specific-row
// callbacks and exposes them through the common `SyncRow` shape instead,
// which is sound here because every real row this engine ever sees for a
// given table genuinely does have that table's shape; the cast is confined
// to this one function rather than scattered across every descriptor.
function toGenericDescriptor<Row extends SyncRow>(d: TableDescriptor<Row>): TableDescriptor {
  return {
    table: d.table,
    singleton: d.singleton,
    ledgerKey: (row) => d.ledgerKey(row as Row),
    isTombstone: d.isTombstone ? (row) => d.isTombstone!(row as Row) : undefined,
    applyTombstone: d.applyTombstone ? (row) => d.applyTombstone!(row as Row) : undefined,
    applyRow: (row) => d.applyRow(row as Row)
  }
}

export interface PodcastRow {
  user_id: string
  id: string
  feed_url: string
  is_private: boolean
  custom_artwork_url: string | null
  updated_at: string
  deleted_at: string | null
  rev?: number
}

export interface PodcastSettingsRow {
  user_id: string
  podcast_id: string
  notify: boolean
  last_seen_pub_date: string | null
  updated_at: string
  rev?: number
}

export interface StationRow {
  user_id: string
  id: string
  name: string | null
  podcast_ids: string[] | null
  sort_by: string
  episodes_per_show: number
  updated_at: string
  deleted_at: string | null
  rev?: number
}

export interface QueueRow {
  user_id: string
  episode_ids: string[] | null
  updated_at: string
  rev?: number
}

export interface QueuePrefsRow {
  user_id: string
  sort_mode: string
  group_by_show: boolean
  queue_view: string
  updated_at: string
  rev?: number
}

export interface PlaybackPositionRow {
  user_id: string
  episode_id: string
  position_sec: number
  updated_at: string
  rev?: number
}

export interface EpisodePlayedRow {
  user_id: string
  episode_id: string
  podcast_id: string
  played: boolean
  duration_sec_override: number | null
  updated_at: string
  rev?: number
}

export interface PrivateFeedRow {
  user_id: string
  id: string
  name: string | null
  url: string | null
  feed_user: string | null
  updated_at: string
  deleted_at: string | null
  rev?: number
}

// Each callback is optional — a platform only instantiates descriptors for
// the tables it actually wants synced. Mobile, for instance, intentionally
// keeps queue_prefs device-local (see mobile/state/store.ts's own
// DEFAULT_SETTINGS comment) rather than syncing it, which is an existing
// product decision, not a gap this rework needs to close.
export interface SyncCallbacks {
  onPodcastRow?: (row: PodcastRow) => void
  onPodcastTombstone?: (row: PodcastRow) => void
  onPodcastSettingsRow?: (row: PodcastSettingsRow) => void
  onStationRow?: (row: StationRow) => void
  onStationTombstone?: (row: StationRow) => void
  onQueueRow?: (row: QueueRow) => void
  onQueuePrefsRow?: (row: QueuePrefsRow) => void
  onPlaybackPositionRow?: (row: PlaybackPositionRow) => void
  onEpisodePlayedRow?: (row: EpisodePlayedRow) => void
  onPrivateFeedRow?: (row: PrivateFeedRow) => void
  onPrivateFeedTombstone?: (row: PrivateFeedRow) => void
}

const isDeleted = (row: { deleted_at: string | null }): boolean => row.deleted_at !== null

export function createTableDescriptors(callbacks: SyncCallbacks): TableDescriptor[] {
  const descriptors: TableDescriptor[] = []

  if (callbacks.onPodcastRow) {
    const d: TableDescriptor<PodcastRow> = {
      table: 'podcasts',
      ledgerKey: (row) => `podcast:${row.id}`,
      isTombstone: isDeleted,
      applyTombstone: callbacks.onPodcastTombstone,
      applyRow: callbacks.onPodcastRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onPodcastSettingsRow) {
    const d: TableDescriptor<PodcastSettingsRow> = {
      table: 'podcast_settings',
      ledgerKey: (row) => `podcastSettings:${row.podcast_id}`,
      applyRow: callbacks.onPodcastSettingsRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onStationRow) {
    const d: TableDescriptor<StationRow> = {
      table: 'stations',
      ledgerKey: (row) => `station:${row.id}`,
      isTombstone: isDeleted,
      applyTombstone: callbacks.onStationTombstone,
      applyRow: callbacks.onStationRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onQueueRow) {
    const d: TableDescriptor<QueueRow> = {
      table: 'queue',
      ledgerKey: () => 'queue',
      singleton: true,
      applyRow: callbacks.onQueueRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onQueuePrefsRow) {
    const d: TableDescriptor<QueuePrefsRow> = {
      table: 'queue_prefs',
      ledgerKey: () => 'queuePrefs',
      singleton: true,
      applyRow: callbacks.onQueuePrefsRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onPlaybackPositionRow) {
    const d: TableDescriptor<PlaybackPositionRow> = {
      table: 'playback_positions',
      ledgerKey: (row) => `playbackPosition:${row.episode_id}`,
      applyRow: callbacks.onPlaybackPositionRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onEpisodePlayedRow) {
    const d: TableDescriptor<EpisodePlayedRow> = {
      table: 'episode_played',
      ledgerKey: (row) => `episodePlayed:${row.episode_id}`,
      applyRow: callbacks.onEpisodePlayedRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  if (callbacks.onPrivateFeedRow) {
    const d: TableDescriptor<PrivateFeedRow> = {
      table: 'private_feeds',
      ledgerKey: (row) => `privateFeed:${row.id}`,
      isTombstone: isDeleted,
      applyTombstone: callbacks.onPrivateFeedTombstone,
      applyRow: callbacks.onPrivateFeedRow
    }
    descriptors.push(toGenericDescriptor(d))
  }

  return descriptors
}

// Re-exported for platform call sites building rows to push — avoids
// importing queueView's types in two places for one type alias each.
export type { QueueSortMode, QueueViewMode }
