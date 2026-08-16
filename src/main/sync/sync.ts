import { IPC_CHANNELS } from '@shared/ipcChannels'
import type { PersistedData, SyncTable } from '../persistence'
import { getSnapshot, persist, touchEpisodes, touchSync, VALID_STATION_SORTS } from '../persistence'
import { QUEUE_SORT_MODES, type QueuePrefs } from '@shared/queueView'
import type { Station } from '@shared/types'
import { subscribe, applyUnsubscribeCascade } from '../subscriptions'
import { getMainWindow } from '../windowRegistry'
import { getSupabase } from './client'

function isRemoteNewer(snapshot: PersistedData, key: string, remoteUpdatedAtIso: string): boolean {
  const remoteMs = new Date(remoteUpdatedAtIso).getTime()
  const localMs = snapshot.syncUpdatedAt[key] ?? 0
  return remoteMs > localMs
}

function findPodcastIdForEpisode(snapshot: PersistedData, episodeId: string): string | null {
  for (const [podcastId, episodes] of Object.entries(snapshot.episodesByPodcast)) {
    if (episodes.some((e) => e.id === episodeId)) return podcastId
  }
  return null
}

function splitKey(key: string): [string, string] {
  const idx = key.indexOf(':')
  return idx === -1 ? [key, ''] : [key.slice(0, idx), key.slice(idx + 1)]
}

// The Supabase JS client never throws on a failed query — it resolves with
// an { error } field instead. Without unwrapping through this, a rejected
// row (RLS denial, a schema mismatch, ...) would silently look like success.
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

const PAGE_SIZE = 1000

// Supabase caps a single .select() at 1000 rows by default — silently, with
// no error, just a truncated result. episode_played in particular can
// easily exceed that for a library with a lot of listening history (one
// real account here has 16,000+), and a truncated pull makes every row past
// 1000 look never-synced even though it exists.
//
// Callers pass { count: 'exact' } in their .select() — the first page's
// response includes the true row count, so every remaining page fires in
// parallel instead of one-at-a-time. Fetching sequentially made a pull with
// 16,000+ episode_played rows take the better part of a minute.
async function fetchAllRows<T>(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>
): Promise<T[]> {
  const first = await query(0, PAGE_SIZE - 1)
  if (first.error) throw new Error(first.error.message)
  const firstPage = first.data ?? []
  const total = first.count ?? firstPage.length
  if (total <= firstPage.length) return firstPage

  const remainingStarts: number[] = []
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) remainingStarts.push(from)

  const restResults = await Promise.all(remainingStarts.map((from) => query(from, from + PAGE_SIZE - 1)))
  const rest: T[] = []
  for (const result of restResults) {
    if (result.error) throw new Error(result.error.message)
    rest.push(...(result.data ?? []))
  }
  return [...firstPage, ...rest]
}

async function currentUserId(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) {
    console.log('[sync] no Supabase client — EMPIRE_POD_SUPABASE_URL/ANON_KEY not set')
    return null
  }
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    console.error('[sync] getUser() failed — treating as signed out:', error.message)
    return null
  }
  if (!data.user) console.log('[sync] getUser() returned no user — not signed in')
  return data.user?.id ?? null
}

// Pulls every syncable table for this user and merges it into local state,
// per-record last-write-wins by updated_at. Podcasts are applied first
// (subscribing fetches episodes), since episode_played and playback rows
// below need those episodes to already exist locally to attach to.
export async function pullAndMerge(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const userId = await currentUserId()
  if (!userId) return
  console.log(`[sync] pull starting for user ${userId}`)

  const snapshot = getSnapshot()

  const podcastRows = await fetchAllRows((from, to) =>
    supabase.from('podcasts').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
  )
  for (const row of podcastRows) {
    const key = `podcast:${row.id}`
    if (!isRemoteNewer(snapshot, key, row.updated_at)) continue
    if (row.deleted_at) {
      if (snapshot.podcasts[row.id]) applyUnsubscribeCascade(row.id)
      delete snapshot.syncUpdatedAt[key]
      continue
    }
    if (!snapshot.podcasts[row.id]) {
      try {
        await subscribe(row.feed_url, row.is_private)
      } catch (err) {
        console.error(`Sync pull: failed to subscribe to ${row.feed_url}:`, err)
        continue
      }
    }
    const podcast = snapshot.podcasts[row.id]
    if (podcast) podcast.customArtworkUrl = row.custom_artwork_url ?? null
    touchSync(key, new Date(row.updated_at).getTime())
  }

  const settingsRows = await fetchAllRows((from, to) =>
    supabase.from('podcast_settings').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
  )
  for (const row of settingsRows) {
    const key = `podcastSettings:${row.podcast_id}`
    if (!isRemoteNewer(snapshot, key, row.updated_at)) continue
    snapshot.podcastSettings[row.podcast_id] = { notify: row.notify }
    touchSync(key, new Date(row.updated_at).getTime())
  }

  const episodeRows = await fetchAllRows((from, to) =>
    supabase.from('episode_played').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
  )
  for (const row of episodeRows) {
    const key = `episodePlayed:${row.episode_id}`
    if (!isRemoteNewer(snapshot, key, row.updated_at)) continue
    const episodes = snapshot.episodesByPodcast[row.podcast_id]
    const idx = episodes?.findIndex((e) => e.id === row.episode_id) ?? -1
    // Podcast/episode not fetched on this device yet — resolves on a later
    // cycle once it exists, no error and nothing to retry explicitly.
    if (!episodes || idx === -1) continue
    episodes[idx] = {
      ...episodes[idx],
      played: row.played,
      durationSec: row.duration_sec_override ?? episodes[idx].durationSec
    }
    const podcast = snapshot.podcasts[row.podcast_id]
    if (podcast) podcast.unread = episodes.filter((e) => !e.played).length
    touchEpisodes(row.podcast_id)
    touchSync(key, new Date(row.updated_at).getTime())
  }

  const stationRows = await fetchAllRows((from, to) =>
    supabase.from('stations').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
  )
  for (const row of stationRows) {
    const key = `station:${row.id}`
    if (!isRemoteNewer(snapshot, key, row.updated_at)) continue
    if (row.deleted_at) {
      delete snapshot.stations[row.id]
      delete snapshot.syncUpdatedAt[key]
      continue
    }
    const station: Station = {
      id: row.id,
      name: row.name ?? 'Untitled Station',
      podcastIds: Array.isArray(row.podcast_ids) ? row.podcast_ids : [],
      sortBy: VALID_STATION_SORTS.has(row.sort_by) ? row.sort_by : 'newest',
      episodesPerShow: typeof row.episodes_per_show === 'number' ? row.episodes_per_show : 5
    }
    snapshot.stations[row.id] = station
    touchSync(key, new Date(row.updated_at).getTime())
  }

  const privateFeedRows = await fetchAllRows((from, to) =>
    supabase.from('private_feeds').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
  )
  for (const row of privateFeedRows) {
    const key = `privateFeed:${row.id}`
    if (!isRemoteNewer(snapshot, key, row.updated_at)) continue
    if (row.deleted_at) {
      delete snapshot.privateFeeds[row.id]
      delete snapshot.syncUpdatedAt[key]
      continue
    }
    // Identity only — never a password (see privateFeeds.ts). A device
    // seeing this feed for the first time gets a placeholder with no
    // credential; playback stays broken here until the password is entered
    // on this device, same as any other new device.
    const existing = snapshot.privateFeeds[row.id]
    snapshot.privateFeeds[row.id] = {
      id: row.id,
      name: row.name ?? existing?.name ?? row.url,
      url: row.url ?? existing?.url ?? '',
      user: row.feed_user ?? existing?.user ?? '',
      encryptedPassword: existing?.encryptedPassword ?? ''
    }
    touchSync(key, new Date(row.updated_at).getTime())
  }

  const queueRow = unwrap(await supabase.from('queue').select('*').eq('user_id', userId).maybeSingle())
  if (queueRow && isRemoteNewer(snapshot, 'queue', queueRow.updated_at)) {
    snapshot.queue = Array.isArray(queueRow.episode_ids) ? queueRow.episode_ids : []
    touchSync('queue', new Date(queueRow.updated_at).getTime())
  }

  const prefsRow = unwrap(
    await supabase.from('queue_prefs').select('*').eq('user_id', userId).maybeSingle()
  )
  if (prefsRow && isRemoteNewer(snapshot, 'queuePrefs', prefsRow.updated_at)) {
    const prefs: QueuePrefs = {
      sortMode: QUEUE_SORT_MODES.includes(prefsRow.sort_mode) ? prefsRow.sort_mode : 'manual',
      groupByShow: Boolean(prefsRow.group_by_show),
      queueView: prefsRow.queue_view === 'grid' ? 'grid' : 'list'
    }
    snapshot.queuePrefs = prefs
    touchSync('queuePrefs', new Date(prefsRow.updated_at).getTime())
  }

  const positionRows = await fetchAllRows((from, to) =>
    supabase.from('playback_positions').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
  )
  for (const row of positionRows) {
    const key = `playbackPosition:${row.episode_id}`
    if (!isRemoteNewer(snapshot, key, row.updated_at)) continue
    snapshot.playbackPositions[row.episode_id] = row.position_sec
    touchSync(key, new Date(row.updated_at).getTime())
  }

  snapshot.syncLastPulledAt = Date.now()
  persist()
  console.log(
    `[sync] pull complete: ${podcastRows.length} podcast rows, ${stationRows.length} station rows seen`
  )
}

// Seeds the cloud with anything that exists locally but has no sync
// bookkeeping entry yet — subscriptions made before this device ever turned
// sync on, or a record that ended up untouched some other way. Runs on every
// push (cheap: just object-key lookups) rather than gating on
// syncLastPushedAt, since that field is set on every push regardless of
// whether anything was actually pushed, so it can't reliably answer "has
// this device ever done a real first sync."
function backfillUntouched(snapshot: PersistedData): void {
  const dirty = snapshot.syncUpdatedAt
  for (const id of Object.keys(snapshot.podcasts)) {
    if (!(`podcast:${id}` in dirty)) touchSync(`podcast:${id}`)
  }
  for (const id of Object.keys(snapshot.podcastSettings)) {
    if (!(`podcastSettings:${id}` in dirty)) touchSync(`podcastSettings:${id}`)
  }
  for (const id of Object.keys(snapshot.stations)) {
    if (!(`station:${id}` in dirty)) touchSync(`station:${id}`)
  }
  for (const id of Object.keys(snapshot.privateFeeds)) {
    if (!(`privateFeed:${id}` in dirty)) touchSync(`privateFeed:${id}`)
  }
  for (const episodes of Object.values(snapshot.episodesByPodcast)) {
    for (const episode of episodes) {
      if (episode.played && !(`episodePlayed:${episode.id}` in dirty)) {
        touchSync(`episodePlayed:${episode.id}`)
      }
    }
  }
  for (const [episodeId, positionSec] of Object.entries(snapshot.playbackPositions)) {
    if (positionSec > 0 && !(`playbackPosition:${episodeId}` in dirty)) {
      touchSync(`playbackPosition:${episodeId}`)
    }
  }
  if (snapshot.queue.length > 0 && !('queue' in dirty)) touchSync('queue')
  if (snapshot.queuePrefs && !('queuePrefs' in dirty)) touchSync('queuePrefs')
}

const PUSH_CHUNK_SIZE = 500

// Supabase upsert() accepts an array of rows in one HTTP request — batching
// this way turns what used to be one round trip PER dirty record (thousands,
// for a library with a lot of played-episode history) into a handful of
// requests. Chunked so one table's batch never gets large enough to risk a
// request-size/row-count limit, and each chunk fails independently so one
// bad row in a batch of 500 doesn't block the rest.
async function upsertChunked(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  table: SyncTable | 'podcast_settings' | 'episode_played' | 'playback_positions',
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += PUSH_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + PUSH_CHUNK_SIZE)
    try {
      unwrap(await supabase.from(table).upsert(chunk))
    } catch (err) {
      console.error(`Sync push failed for ${table} rows ${i}-${i + chunk.length}:`, err)
    }
  }
}

// Scans syncUpdatedAt for anything newer than the last successful push
// (rather than an in-memory "what changed" list) so a crash right after an
// edit never loses it — the watermark is captured before the scan starts so
// an edit landing mid-push isn't missed either.
export async function pushDirty(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const userId = await currentUserId()
  if (!userId) return

  const snapshot = getSnapshot()
  backfillUntouched(snapshot)
  const watermark = Date.now()
  const dirty = Object.entries(snapshot.syncUpdatedAt).filter(
    ([, updatedAt]) => updatedAt > (snapshot.syncLastPushedAt ?? 0)
  )
  console.log(
    `[sync] push starting for user ${userId}: ${dirty.length} dirty record(s), ${snapshot.syncPendingDeletes.length} pending delete(s)`
  )

  const podcastRows: Record<string, unknown>[] = []
  const podcastSettingsRows: Record<string, unknown>[] = []
  const stationRows: Record<string, unknown>[] = []
  const privateFeedRows: Record<string, unknown>[] = []
  const episodePlayedRows: Record<string, unknown>[] = []
  const playbackPositionRows: Record<string, unknown>[] = []
  let queueRow: Record<string, unknown> | null = null
  let queuePrefsRow: Record<string, unknown> | null = null

  for (const [key, updatedAtMs] of dirty) {
    const updatedAt = new Date(updatedAtMs).toISOString()
    const [kind, id] = splitKey(key)
    if (kind === 'podcast') {
      const podcast = snapshot.podcasts[id]
      if (!podcast) continue
      podcastRows.push({
        user_id: userId,
        id: podcast.id,
        feed_url: podcast.feedUrl,
        is_private: podcast.isPrivate,
        custom_artwork_url: podcast.customArtworkUrl,
        updated_at: updatedAt,
        deleted_at: null
      })
    } else if (kind === 'podcastSettings') {
      const settings = snapshot.podcastSettings[id]
      if (!settings) continue
      podcastSettingsRows.push({
        user_id: userId,
        podcast_id: id,
        notify: settings.notify,
        updated_at: updatedAt
      })
    } else if (kind === 'station') {
      const station = snapshot.stations[id]
      if (!station) continue
      stationRows.push({
        user_id: userId,
        id: station.id,
        name: station.name,
        podcast_ids: station.podcastIds,
        sort_by: station.sortBy,
        episodes_per_show: station.episodesPerShow,
        updated_at: updatedAt,
        deleted_at: null
      })
    } else if (kind === 'privateFeed') {
      const feed = snapshot.privateFeeds[id]
      if (!feed) continue
      privateFeedRows.push({
        user_id: userId,
        id: feed.id,
        name: feed.name,
        url: feed.url,
        feed_user: feed.user,
        updated_at: updatedAt,
        deleted_at: null
      })
    } else if (kind === 'episodePlayed') {
      const podcastId = findPodcastIdForEpisode(snapshot, id)
      const episode = podcastId
        ? snapshot.episodesByPodcast[podcastId]?.find((e) => e.id === id)
        : undefined
      if (!podcastId || !episode) continue
      episodePlayedRows.push({
        user_id: userId,
        episode_id: id,
        podcast_id: podcastId,
        played: episode.played,
        duration_sec_override: episode.durationSec,
        updated_at: updatedAt
      })
    } else if (kind === 'playbackPosition') {
      const positionSec = snapshot.playbackPositions[id]
      if (positionSec === undefined) continue
      playbackPositionRows.push({
        user_id: userId,
        episode_id: id,
        position_sec: positionSec,
        updated_at: updatedAt
      })
    } else if (key === 'queue') {
      queueRow = { user_id: userId, episode_ids: snapshot.queue, updated_at: updatedAt }
    } else if (key === 'queuePrefs' && snapshot.queuePrefs) {
      queuePrefsRow = {
        user_id: userId,
        sort_mode: snapshot.queuePrefs.sortMode,
        group_by_show: snapshot.queuePrefs.groupByShow,
        queue_view: snapshot.queuePrefs.queueView,
        updated_at: updatedAt
      }
    }
  }

  if (podcastRows.length) await upsertChunked(supabase, 'podcasts', podcastRows)
  if (podcastSettingsRows.length) {
    await upsertChunked(supabase, 'podcast_settings', podcastSettingsRows)
  }
  if (stationRows.length) await upsertChunked(supabase, 'stations', stationRows)
  if (privateFeedRows.length) await upsertChunked(supabase, 'private_feeds', privateFeedRows)
  if (episodePlayedRows.length) {
    await upsertChunked(supabase, 'episode_played', episodePlayedRows)
  }
  if (playbackPositionRows.length) {
    await upsertChunked(supabase, 'playback_positions', playbackPositionRows)
  }
  if (queueRow) {
    try {
      unwrap(await supabase.from('queue').upsert(queueRow))
    } catch (err) {
      console.error('Sync push failed for queue:', err)
    }
  }
  if (queuePrefsRow) {
    try {
      unwrap(await supabase.from('queue_prefs').upsert(queuePrefsRow))
    } catch (err) {
      console.error('Sync push failed for queuePrefs:', err)
    }
  }

  for (const pending of [...snapshot.syncPendingDeletes]) {
    try {
      unwrap(
        await supabase.from(pending.table as SyncTable).upsert({
          user_id: userId,
          id: pending.localId,
          deleted_at: new Date(pending.deletedAt).toISOString(),
          updated_at: new Date(pending.deletedAt).toISOString()
        })
      )
      snapshot.syncPendingDeletes = snapshot.syncPendingDeletes.filter((p) => p !== pending)
    } catch (err) {
      console.error(`Sync tombstone push failed for ${pending.key}:`, err)
    }
  }

  snapshot.syncLastPushedAt = watermark
  persist()
  console.log(`[sync] push complete`)
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

export function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    pushDirty().catch((err) => console.error('Scheduled sync push failed:', err))
  }, 2000)
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
    await pushDirty()
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
