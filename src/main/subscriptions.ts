import type { Podcast, Episode } from '@shared/types'
import { IPC_CHANNELS } from '@shared/ipcChannels'
import { getSnapshot, persist, DEFAULT_PODCAST_SETTINGS } from './persistence'
import { parseFeed, hashId } from './rss'
import { notify } from './notifications'
import { getMainWindow } from './windowRegistry'

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
  if (!snapshot.podcastSettings[id]) snapshot.podcastSettings[id] = { ...DEFAULT_PODCAST_SETTINGS }
  persist()

  return podcast
}

export function unsubscribe(podcastId: string): void {
  const snapshot = getSnapshot()
  // Must read this before deleting episodesByPodcast[podcastId] below — the
  // filter afterward otherwise always sees `undefined` and the queue keeps
  // stale ids for this podcast forever.
  const removedEpisodeIds = new Set((snapshot.episodesByPodcast[podcastId] ?? []).map((e) => e.id))
  delete snapshot.podcasts[podcastId]
  delete snapshot.episodesByPodcast[podcastId]
  delete snapshot.podcastSettings[podcastId]
  snapshot.queue = snapshot.queue.filter((episodeId) => !removedEpisodeIds.has(episodeId))
  for (const station of Object.values(snapshot.stations)) {
    station.podcastIds = station.podcastIds.filter((id) => id !== podcastId)
  }
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
    undefined,
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
  for (const id of ids) {
    try {
      const { newEpisodeIds } = await refreshPodcast(id)
      results.push({ podcastId: id, newEpisodeCount: newEpisodeIds.length })
    } catch (err) {
      console.error(`Failed to refresh podcast ${id}:`, err)
      results.push({ podcastId: id, newEpisodeCount: 0 })
    }
  }
  return results
}

// dataUrl is null to clear the override and revert to the feed's own artwork.
export function setPodcastArtwork(podcastId: string, dataUrl: string | null): Podcast {
  const snapshot = getSnapshot()
  const podcast = snapshot.podcasts[podcastId]
  if (!podcast) throw new Error(`Not subscribed to podcast ${podcastId}`)
  podcast.customArtworkUrl = dataUrl
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
    persist()
    return
  }
}
