import { app } from 'electron'
import { join } from 'node:path'
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
  mkdirSync,
  unlinkSync
} from 'node:fs'
import type { Podcast, Episode, PrivateFeed, PodcastSettings, Station, DiscoverPodcast } from '@shared/types'
import { QUEUE_SORT_MODES, type QueuePrefs } from '@shared/queueView'

export const DEFAULT_PODCAST_SETTINGS: PodcastSettings = {
  notify: false
}

export interface PersistedPrivateFeed extends PrivateFeed {
  encryptedPassword: string // base64
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ColumnLayout {
  sidebarW: number
  mainContentW: number
}

export interface DailyPick {
  date: string // YYYY-MM-DD — recomputed once this no longer matches today
  podcast: DiscoverPodcast
}

// One row per Supabase table a locally-deleted record needs to tombstone —
// queued here (rather than pushed immediately) so the delete survives a
// crash before the next sync push, same as any other durable state.
export type SyncTable = 'podcasts' | 'stations' | 'private_feeds'

export interface SyncPendingDelete {
  key: string // matches the syncUpdatedAt key the record used while it existed
  table: SyncTable
  localId: string
  deletedAt: number
}

export interface PersistedData {
  version: 1
  podcasts: Record<string, Podcast>
  episodesByPodcast: Record<string, Episode[]>
  queue: string[] // episodeIds
  currentEpisodeId: string | null
  playbackPositions: Record<string, number> // episodeId -> seconds
  privateFeeds: Record<string, PersistedPrivateFeed>
  podcastSettings: Record<string, PodcastSettings>
  stations: Record<string, Station>
  windowBounds: WindowBounds | null
  columnLayout: ColumnLayout | null
  dailyPick: DailyPick | null
  queuePrefs: QueuePrefs | null
  // Cloud-sync bookkeeping — see src/main/sync/. Keyed by a synthetic string
  // ("podcast:<id>", "queue", "playbackPosition:<episodeId>", ...) rather than
  // fields on Podcast/Station/etc. themselves, so syncing never has to change
  // those types or the IPC contract built on them.
  syncUpdatedAt: Record<string, number> // key -> epoch ms of the local edit
  syncPendingDeletes: SyncPendingDelete[]
  syncLastPushedAt: number | null
  syncLastPulledAt: number | null
}

function defaults(): PersistedData {
  return {
    version: 1,
    podcasts: {},
    episodesByPodcast: {},
    queue: [],
    currentEpisodeId: null,
    playbackPositions: {},
    privateFeeds: {},
    podcastSettings: {},
    stations: {},
    windowBounds: null,
    columnLayout: null,
    dailyPick: null,
    queuePrefs: null,
    syncUpdatedAt: {},
    syncPendingDeletes: [],
    syncLastPushedAt: null,
    syncLastPulledAt: null
  }
}

function filePath(): string {
  return join(app.getPath('userData'), 'empire-pod-data.json')
}

// Episodes live one JSON file per podcast instead of inline in the main data
// file — a library-wide file easily runs into the thousands of episodes, and
// without this split, saving something as small as a single playback
// position would rewrite the entire multi-MB blob on every debounced write.
function episodesDir(): string {
  return join(app.getPath('userData'), 'episodes')
}

function backupsDir(): string {
  return join(app.getPath('userData'), 'backups')
}

const MAX_BACKUPS = 10

let data: PersistedData | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

// podcastIds whose episodesByPodcast entry has changed (or been deleted)
// since the last write — only these get their episode file rewritten,
// instead of every podcast's episodes on every save. Callers that mutate
// episodesByPodcast must call touchEpisodes(podcastId) alongside persist().
const dirtyEpisodeIds = new Set<string>()

export function touchEpisodes(podcastId: string): void {
  dirtyEpisodeIds.add(podcastId)
}

// Marks a syncable record dirty for the next cloud-sync push. `at` defaults
// to now, but sync.ts overrides it to the remote's own timestamp when
// applying a pulled record — that keeps local and remote in exact agreement
// so the next push doesn't immediately re-push what was just pulled.
export function touchSync(key: string, at: number = Date.now()): void {
  getSnapshot().syncUpdatedAt[key] = at
}

// A deleted record has nothing left for pushDirty()'s dirty-scan to find, so
// its delete is queued explicitly instead — persisted like everything else,
// so it survives a crash before the next sync push flushes it.
export function touchSyncDelete(table: SyncTable, localId: string, key: string): void {
  const snapshot = getSnapshot()
  delete snapshot.syncUpdatedAt[key]
  snapshot.syncPendingDeletes.push({ key, table, localId, deletedAt: Date.now() })
}

export const VALID_STATION_SORTS = new Set(['newest', 'oldest', 'shortest', 'longest'])

// Defends against data written by an older build with a different shape for
// these two records (both changed schema recently) — without this, a stale
// station or settings entry from disk could crash the UI (e.g. reading
// `.podcastIds` off an old episodeIds-only station).
export function normalize(parsed: PersistedData): PersistedData {
  const stations: Record<string, Station> = {}
  for (const [id, station] of Object.entries(parsed.stations ?? {})) {
    stations[id] = {
      id,
      name: station.name ?? 'Untitled Station',
      podcastIds: Array.isArray(station.podcastIds) ? station.podcastIds : [],
      sortBy: VALID_STATION_SORTS.has(station.sortBy) ? station.sortBy : 'newest',
      episodesPerShow:
        typeof station.episodesPerShow === 'number' ? station.episodesPerShow : 5
    }
  }

  const podcastSettings: Record<string, PodcastSettings> = {}
  for (const [id, settings] of Object.entries(parsed.podcastSettings ?? {})) {
    podcastSettings[id] = { notify: Boolean(settings.notify) }
  }

  const podcasts: Record<string, Podcast> = {}
  for (const [id, podcast] of Object.entries(parsed.podcasts ?? {})) {
    podcasts[id] = {
      ...podcast,
      customArtworkUrl: typeof podcast.customArtworkUrl === 'string' ? podcast.customArtworkUrl : null
    }
  }

  const bounds = parsed.windowBounds
  const windowBounds =
    bounds &&
    typeof bounds.x === 'number' &&
    typeof bounds.y === 'number' &&
    typeof bounds.width === 'number' &&
    typeof bounds.height === 'number'
      ? bounds
      : null

  const layout = parsed.columnLayout
  const columnLayout =
    layout && typeof layout.sidebarW === 'number' && typeof layout.mainContentW === 'number'
      ? layout
      : null

  const pick = parsed.dailyPick
  const dailyPick =
    pick && typeof pick.date === 'string' && pick.podcast && typeof pick.podcast.feedUrl === 'string'
      ? pick
      : null

  const prefs = parsed.queuePrefs
  const queuePrefs: QueuePrefs | null =
    prefs &&
    QUEUE_SORT_MODES.includes(prefs.sortMode) &&
    typeof prefs.groupByShow === 'boolean' &&
    (prefs.queueView === 'grid' || prefs.queueView === 'list')
      ? prefs
      : null

  // Self-heals stale queue entries left behind by a since-fixed unsubscribe
  // bug (and guards against any future cause of drift) — an id that no
  // longer resolves to a loaded episode can never play and would otherwise
  // silently throw off index-based UI assumptions forever.
  const episodesByPodcast = parsed.episodesByPodcast ?? {}
  const knownEpisodeIds = new Set(Object.values(episodesByPodcast).flatMap((eps) => eps.map((e) => e.id)))
  const queue = Array.isArray(parsed.queue) ? parsed.queue.filter((id) => knownEpisodeIds.has(id)) : []

  const syncUpdatedAt =
    parsed.syncUpdatedAt && typeof parsed.syncUpdatedAt === 'object' ? parsed.syncUpdatedAt : {}
  const syncPendingDeletes = Array.isArray(parsed.syncPendingDeletes) ? parsed.syncPendingDeletes : []
  const syncLastPushedAt = typeof parsed.syncLastPushedAt === 'number' ? parsed.syncLastPushedAt : null
  const syncLastPulledAt = typeof parsed.syncLastPulledAt === 'number' ? parsed.syncLastPulledAt : null

  return {
    ...parsed,
    stations,
    podcastSettings,
    podcasts,
    windowBounds,
    columnLayout,
    dailyPick,
    queuePrefs,
    queue,
    syncUpdatedAt,
    syncPendingDeletes,
    syncLastPushedAt,
    syncLastPulledAt
  }
}

function loadEpisodesFromDisk(): Record<string, Episode[]> {
  const dir = episodesDir()
  if (!existsSync(dir)) return {}
  const result: Record<string, Episode[]> = {}
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const podcastId = name.slice(0, -'.json'.length)
    try {
      result[podcastId] = JSON.parse(readFileSync(join(dir, name), 'utf-8'))
    } catch (err) {
      console.error(`Failed to read episodes for podcast ${podcastId}, dropping:`, err)
    }
  }
  return result
}

function load(): PersistedData {
  const path = filePath()
  if (!existsSync(path)) return defaults()
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as PersistedData
    // Per-podcast files win over anything still embedded in the main file —
    // that's just a pre-split (or imported) data file that hasn't been
    // migrated out yet.
    const inlineEpisodes = parsed.episodesByPodcast ?? {}
    const fromFiles = loadEpisodesFromDisk()
    const merged: PersistedData = {
      ...defaults(),
      ...parsed,
      episodesByPodcast: { ...inlineEpisodes, ...fromFiles }
    }
    // A podcast that's never touched again after this load (e.g. a private
    // feed whose refresh keeps failing) would otherwise lose its episodes
    // for good: writeNow() always writes an empty episodesByPodcast to the
    // main file, so if nothing schedules this podcast's own file to be
    // written, the *next* save silently drops data that was sitting right
    // here. Marking it dirty up front guarantees it gets flushed out
    // regardless of what else does or doesn't happen to it.
    for (const [podcastId, episodes] of Object.entries(inlineEpisodes)) {
      if (episodes.length > 0 && !fromFiles[podcastId]) touchEpisodes(podcastId)
    }
    return normalize(merged)
  } catch (err) {
    console.error('Failed to read persisted data, starting fresh:', err)
    return defaults()
  }
}

export function getSnapshot(): PersistedData {
  if (!data) data = load()
  return data
}

function writeEpisodeFiles(): void {
  if (dirtyEpisodeIds.size === 0) return
  const dir = episodesDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const episodesByPodcast = getSnapshot().episodesByPodcast
  for (const podcastId of dirtyEpisodeIds) {
    const episodes = episodesByPodcast[podcastId]
    const episodePath = join(dir, `${podcastId}.json`)
    if (episodes) {
      const tmpPath = `${episodePath}.tmp`
      writeFileSync(tmpPath, JSON.stringify(episodes), 'utf-8')
      renameSync(tmpPath, episodePath)
    } else if (existsSync(episodePath)) {
      unlinkSync(episodePath)
    }
  }
  dirtyEpisodeIds.clear()
}

function writeNow(): void {
  const path = filePath()
  const tmpPath = `${path}.tmp`
  // episodesByPodcast is stored separately (see writeEpisodeFiles) — never
  // written here, so a routine save (mark-played, queue reorder, ...) stays
  // cheap regardless of how many episodes are in the library.
  writeFileSync(tmpPath, JSON.stringify({ ...getSnapshot(), episodesByPodcast: {} }, null, 2), 'utf-8')
  renameSync(tmpPath, path)
  writeEpisodeFiles()
}

function pruneBackups(): void {
  const dir = backupsDir()
  const files = readdirSync(dir)
    .filter((name) => name.startsWith('empire-pod-data-') && name.endsWith('.json'))
    .sort()
  for (const name of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
    unlinkSync(join(dir, name))
  }
}

// Snapshots the main data file (subscriptions, queue, positions, settings,
// private feed credentials, stations) so a corrupted write or a
// fat-fingered unsubscribe doesn't lose everything — episodes aren't
// included since they're just a cache of each feed and always re-fetchable.
// Only runs at quit (persistNow), not on every debounced write, so this
// stays a handful of files instead of one per keystroke.
function writeBackup(): void {
  const dir = backupsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(dir, `empire-pod-data-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify({ ...getSnapshot(), episodesByPodcast: {} }, null, 2), 'utf-8')
  pruneBackups()
}

export function persist(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    writeNow()
  }, 250)
}

export function persistNow(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  writeNow()
  writeBackup()
}
