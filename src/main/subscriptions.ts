import { safeStorage } from 'electron'
import type { Podcast, Episode } from '@shared/types'
import { IPC_CHANNELS } from '@shared/ipcChannels'
import {
  getSnapshot,
  persist,
  touchEpisodes,
  touchSync,
  touchSyncDelete,
  DEFAULT_PODCAST_SETTINGS
} from './persistence'
import { parseFeed, hashId } from './rss'
import { notify } from './notifications'
import { getMainWindow } from './windowRegistry'
import { readOpmlFeedUrls } from './opml'

// Private feeds are stored as regular podcasts (see privateFeeds.ts) so they
// show up in the Library like any other subscription — but fetching them
// needs the saved Basic auth credentials. Without this, refreshPodcast (and
// therefore the periodic/startup refreshAllPodcasts below) would fetch
// private feeds unauthenticated, fail every time, and never surface new
// episodes.
function privateAuthHeader(podcastId: string): string | undefined {
  const feed = getSnapshot().privateFeeds[podcastId]
  if (!feed) return undefined
  const pass = safeStorage.decryptString(Buffer.from(feed.encryptedPassword, 'base64'))
  return `Basic ${Buffer.from(`${feed.user}:${pass}`).toString('base64')}`
}

export function listPodcasts(): Podcast[] {
  return Object.values(getSnapshot().podcasts)
}

export function listEpisodes(podcastId: string): Episode[] {
  const episodes = getSnapshot().episodesByPodcast[podcastId] ?? []
  return [...episodes].sort((a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1))
}

function computeUnread(episodes: Episode[]): number {
  return episodes.filter((e) => !e.played).length
}

export async function subscribe(feedUrl: string, isPrivate = false): Promise<Podcast> {
  const id = hashId(feedUrl)
  const snapshot = getSnapshot()

  const existing = snapshot.podcasts[id]
  if (existing) return existing

  const { podcast: parsed, episodes } = await parseFeed(feedUrl, undefined, id)

  const podcast: Podcast = {
    id,
    feedUrl,
    name: parsed.name,
    author: parsed.author,
    artworkUrl: parsed.artworkUrl,
    customArtworkUrl: null,
    description: parsed.description,
    category: parsed.category,
    unread: computeUnread(episodes),
    isPrivate
  }

  snapshot.podcasts[id] = podcast
  snapshot.episodesByPodcast[id] = episodes
  touchEpisodes(id)
  if (!snapshot.podcastSettings[id]) snapshot.podcastSettings[id] = { ...DEFAULT_PODCAST_SETTINGS }
  touchSync(`podcast:${id}`)
  persist()

  return podcast
}

export interface OpmlImportResult {
  imported: Podcast[]
  skipped: number
  failed: { feedUrl: string; error: string }[]
}

// Overcast (and every other podcast app) exports subscriptions as OPML —
// a flat list of feed URLs. Subscribing to a few hundred of them one at a
// time over the network would be slow, so a small worker pool fetches
// several feeds concurrently. Each feed's failure is isolated so one broken
// or dead feed in the file doesn't abort the rest of the import.
export async function importOpml(filePath: string): Promise<OpmlImportResult> {
  const feedUrls = await readOpmlFeedUrls(filePath)
  const snapshot = getSnapshot()
  const imported: Podcast[] = []
  const failed: { feedUrl: string; error: string }[] = []
  let skipped = 0

  const CONCURRENCY = 4
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < feedUrls.length) {
      const feedUrl = feedUrls[cursor++]
      if (snapshot.podcasts[hashId(feedUrl)]) {
        skipped++
        continue
      }
      try {
        imported.push(await subscribe(feedUrl))
      } catch (err) {
        failed.push({ feedUrl, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, feedUrls.length) }, worker))

  return { imported, skipped, failed }
}

// Shared by the direct unsubscribe action below and by sync.ts applying a
// remote unsubscribe tombstone — both need the exact same cleanup (queue and
// station references dangling on a podcast id must never survive an
// unsubscribe), just triggered from a different origin.
export function applyUnsubscribeCascade(podcastId: string): void {
  const snapshot = getSnapshot()
  // Must read this before deleting episodesByPodcast[podcastId] below — the
  // filter afterward otherwise always sees `undefined` and the queue keeps
  // stale ids for this podcast forever.
  const removedEpisodeIds = new Set((snapshot.episodesByPodcast[podcastId] ?? []).map((e) => e.id))
  delete snapshot.podcasts[podcastId]
  delete snapshot.episodesByPodcast[podcastId]
  touchEpisodes(podcastId)
  delete snapshot.podcastSettings[podcastId]
  // Private feeds are stored as regular podcasts with a matching entry in
  // privateFeeds keyed by the same id (see privateFeeds.ts) — unsubscribing
  // via the generic Sidebar/EpisodeScreen path must clean that up too, or it
  // leaves an orphaned credential record that can never surface as a
  // subscription again (podcasts[id] is gone but privateFeeds[id] isn't).
  delete snapshot.privateFeeds[podcastId]

  const nextQueue = snapshot.queue.filter((episodeId) => !removedEpisodeIds.has(episodeId))
  if (nextQueue.length !== snapshot.queue.length) touchSync('queue')
  snapshot.queue = nextQueue

  for (const station of Object.values(snapshot.stations)) {
    if (!station.podcastIds.includes(podcastId)) continue
    station.podcastIds = station.podcastIds.filter((id) => id !== podcastId)
    touchSync(`station:${station.id}`)
  }
}

export function unsubscribe(podcastId: string): void {
  applyUnsubscribeCascade(podcastId)
  touchSyncDelete('podcasts', podcastId, `podcast:${podcastId}`)
  persist()
}

export interface RefreshOutcome {
  podcast: Podcast
  episodes: Episode[]
  newEpisodeIds: string[]
}

export async function refreshPodcast(podcastId: string): Promise<RefreshOutcome> {
  const snapshot = getSnapshot()
  const existing = snapshot.podcasts[podcastId]
  if (!existing) throw new Error(`Not subscribed to podcast ${podcastId}`)

  const { podcast: parsed, episodes: freshEpisodes } = await parseFeed(
    existing.feedUrl,
    privateAuthHeader(podcastId),
    podcastId
  )

  const priorEpisodes = snapshot.episodesByPodcast[podcastId] ?? []
  const priorById = new Map(priorEpisodes.map((e) => [e.id, e]))
  const newEpisodeIds: string[] = []

  const merged = freshEpisodes.map((fresh) => {
    const prior = priorById.get(fresh.id)
    if (prior) return { ...fresh, played: prior.played }
    newEpisodeIds.push(fresh.id)
    return fresh
  })

  const podcast: Podcast = {
    ...existing,
    name: parsed.name,
    author: parsed.author,
    artworkUrl: parsed.artworkUrl,
    description: parsed.description,
    category: parsed.category,
    unread: computeUnread(merged)
  }

  snapshot.podcasts[podcastId] = podcast
  snapshot.episodesByPodcast[podcastId] = merged
  touchEpisodes(podcastId)
  persist()

  // Push the fresh data to the renderer regardless of who triggered this
  // refresh — the periodic background timer has no caller to hand a return
  // value to, so without this the open UI would only pick up new episodes
  // after a full app restart.
  getMainWindow()?.webContents.send(IPC_CHANNELS.SUBSCRIPTIONS_UPDATED_EVENT, {
    podcast,
    episodes: merged
  })

  const settings = snapshot.podcastSettings[podcastId] ?? DEFAULT_PODCAST_SETTINGS
  if (settings.notify && newEpisodeIds.length > 0) {
    const label = newEpisodeIds.length === 1 ? 'episode' : 'episodes'
    notify(podcast.name, `${newEpisodeIds.length} new ${label}`)
  }

  return { podcast, episodes: merged, newEpisodeIds }
}

export async function refreshAllPodcasts(): Promise<
  { podcastId: string; newEpisodeCount: number }[]
> {
  const ids = Object.keys(getSnapshot().podcasts)
  const results: { podcastId: string; newEpisodeCount: number }[] = []
  // Lets the renderer show a "Syncing…" indicator (bottom-left of the sidebar,
  // like the YouTube app) for both the startup refresh and the periodic
  // background one — otherwise a multi-podcast library refreshing on a slow
  // connection looks like nothing is happening.
  getMainWindow()?.webContents.send(IPC_CHANNELS.SYNC_STATUS_EVENT, { status: 'syncing' })
  for (const id of ids) {
    try {
      const { newEpisodeIds } = await refreshPodcast(id)
      results.push({ podcastId: id, newEpisodeCount: newEpisodeIds.length })
    } catch (err) {
      console.error(`Failed to refresh podcast ${id}:`, err)
      results.push({ podcastId: id, newEpisodeCount: 0 })
    }
  }
  const newEpisodeCount = results.reduce((sum, r) => sum + r.newEpisodeCount, 0)
  getMainWindow()?.webContents.send(IPC_CHANNELS.SYNC_STATUS_EVENT, {
    status: 'idle',
    newEpisodeCount
  })
  return results
}

// dataUrl is null to clear the override and revert to the feed's own artwork.
export function setPodcastArtwork(podcastId: string, dataUrl: string | null): Podcast {
  const snapshot = getSnapshot()
  const podcast = snapshot.podcasts[podcastId]
  if (!podcast) throw new Error(`Not subscribed to podcast ${podcastId}`)
  podcast.customArtworkUrl = dataUrl
  touchSync(`podcast:${podcastId}`)
  persist()
  return podcast
}

export function markEpisodePlayed(episodeId: string, played: boolean): void {
  const snapshot = getSnapshot()
  for (const podcastId of Object.keys(snapshot.episodesByPodcast)) {
    const episodes = snapshot.episodesByPodcast[podcastId]
    const idx = episodes.findIndex((e) => e.id === episodeId)
    if (idx === -1) continue
    episodes[idx] = { ...episodes[idx], played }
    const podcast = snapshot.podcasts[podcastId]
    if (podcast) podcast.unread = computeUnread(episodes)
    touchEpisodes(podcastId)
    touchSync(`episodePlayed:${episodeId}`)
    persist()
    return
  }
}

// Some feeds omit (or malform) <itunes:duration>, leaving durationSec at 0
// and the run time blank everywhere it's shown. Once the audio element
// actually loads the file we know the real duration for free — this backs
// it into the persisted episode so the list only ever needs to learn it once.
export function setEpisodeDuration(episodeId: string, durationSec: number): void {
  const snapshot = getSnapshot()
  for (const [podcastId, episodes] of Object.entries(snapshot.episodesByPodcast)) {
    const idx = episodes.findIndex((e) => e.id === episodeId)
    if (idx === -1) continue
    episodes[idx] = { ...episodes[idx], durationSec }
    touchEpisodes(podcastId)
    touchSync(`episodePlayed:${episodeId}`)
    persist()
    return
  }
}
