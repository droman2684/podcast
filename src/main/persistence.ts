import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import type { Podcast, Episode, PrivateFeed, PodcastSettings, Station } from '@shared/types'

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
    columnLayout: null
  }
}

function filePath(): string {
  return join(app.getPath('userData'), 'empire-pod-data.json')
}

let data: PersistedData | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

const VALID_SORTS = new Set(['newest', 'oldest', 'shortest', 'longest'])

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
      sortBy: VALID_SORTS.has(station.sortBy) ? station.sortBy : 'newest',
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

  // Self-heals stale queue entries left behind by a since-fixed unsubscribe
  // bug (and guards against any future cause of drift) — an id that no
  // longer resolves to a loaded episode can never play and would otherwise
  // silently throw off index-based UI assumptions forever.
  const episodesByPodcast = parsed.episodesByPodcast ?? {}
  const knownEpisodeIds = new Set(Object.values(episodesByPodcast).flatMap((eps) => eps.map((e) => e.id)))
  const queue = Array.isArray(parsed.queue) ? parsed.queue.filter((id) => knownEpisodeIds.has(id)) : []

  return {
    ...parsed,
    stations,
    podcastSettings,
    podcasts,
    windowBounds,
    columnLayout,
    queue
  }
}

function load(): PersistedData {
  const path = filePath()
  if (!existsSync(path)) return defaults()
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as PersistedData
    return normalize({ ...defaults(), ...parsed })
  } catch (err) {
    console.error('Failed to read persisted data, starting fresh:', err)
    return defaults()
  }
}

export function getSnapshot(): PersistedData {
  if (!data) data = load()
  return data
}

function writeNow(): void {
  const path = filePath()
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(getSnapshot(), null, 2), 'utf-8')
  renameSync(tmpPath, path)
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
}
