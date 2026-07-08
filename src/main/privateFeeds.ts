import { safeStorage } from 'electron'
import type { PrivateFeed, Episode } from '@shared/types'
import { getSnapshot, persist, type PersistedPrivateFeed } from './persistence'
import { parseFeed, hashId } from './rss'

function toPublic(feed: PersistedPrivateFeed): PrivateFeed {
  return { id: feed.id, name: feed.name, url: feed.url, user: feed.user }
}

export function listPrivateFeeds(): PrivateFeed[] {
  return Object.values(getSnapshot().privateFeeds).map(toPublic)
}

function deriveName(url: string): string {
  return url.replace(/^https?:\/\//, '').split('/')[0]
}

export async function addPrivateFeed(url: string, user: string, pass: string): Promise<PrivateFeed> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain unavailable — cannot store the password securely on this machine.')
  }

  const id = hashId(url)
  const authHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

  // Validate the credentials work before persisting anything.
  const { podcast: parsed, episodes } = await parseFeed(url, authHeader, id)

  const snapshot = getSnapshot()
  const encryptedPassword = safeStorage.encryptString(pass).toString('base64')
  const record: PersistedPrivateFeed = {
    id,
    name: parsed.name || deriveName(url),
    url,
    user,
    encryptedPassword
  }
  snapshot.privateFeeds[id] = record
  snapshot.podcasts[id] = {
    id,
    feedUrl: url,
    name: record.name,
    author: parsed.author,
    artworkUrl: parsed.artworkUrl,
    customArtworkUrl: null,
    description: parsed.description,
    category: parsed.category,
    unread: episodes.filter((e) => !e.played).length,
    isPrivate: true
  }
  snapshot.episodesByPodcast[id] = episodes
  persist()

  return toPublic(record)
}

export function removePrivateFeed(id: string): void {
  const snapshot = getSnapshot()
  delete snapshot.privateFeeds[id]
  delete snapshot.podcasts[id]
  delete snapshot.episodesByPodcast[id]
  delete snapshot.podcastSettings[id]
  persist()
}

export async function refreshPrivateFeed(id: string): Promise<{ episodes: Episode[] }> {
  const snapshot = getSnapshot()
  const feed = snapshot.privateFeeds[id]
  if (!feed) throw new Error(`Private feed ${id} not found`)

  const pass = safeStorage.decryptString(Buffer.from(feed.encryptedPassword, 'base64'))
  const authHeader = `Basic ${Buffer.from(`${feed.user}:${pass}`).toString('base64')}`
  const { episodes } = await parseFeed(feed.url, authHeader, id)

  const priorById = new Map((snapshot.episodesByPodcast[id] ?? []).map((e) => [e.id, e]))
  const merged = episodes.map((fresh) => {
    const prior = priorById.get(fresh.id)
    return prior ? { ...fresh, played: prior.played } : fresh
  })

  snapshot.episodesByPodcast[id] = merged
  const podcast = snapshot.podcasts[id]
  if (podcast) podcast.unread = merged.filter((e) => !e.played).length
  persist()

  return { episodes: merged }
}
