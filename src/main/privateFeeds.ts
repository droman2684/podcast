import { safeStorage } from 'electron'
import type { PrivateFeed } from '@shared/types'
import {
  getSnapshot,
  persist,
  touchEpisodes,
  touchSync,
  touchSyncDelete,
  type PersistedPrivateFeed
} from './persistence'
import { parseFeed, hashId } from './rss'
import { refreshPodcast, type RefreshOutcome } from './subscriptions'

function toPublic(feed: PersistedPrivateFeed): PrivateFeed {
  return { id: feed.id, name: feed.name, url: feed.url, user: feed.user }
}

export function listPrivateFeeds(): PrivateFeed[] {
  return Object.values(getSnapshot().privateFeeds).map(toPublic)
}

function deriveName(url: string): string {
  return url.replace(/^https?:\/\//, '').split('/')[0]
}

export async function addPrivateFeed(rawUrl: string, rawUser: string, pass: string): Promise<PrivateFeed> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS keychain unavailable — cannot store the password securely on this machine.')
  }

  // Stray whitespace (easy to pick up when copy-pasting a feed URL) breaks
  // exact host-matching in authHeaderForHost below, silently disabling
  // authenticated audio playback for the feed.
  const url = rawUrl.trim()
  const user = rawUser.trim()

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
  touchEpisodes(id)
  // Only the identity fields (id/name/url/user) ever reach Supabase — see
  // sync/sync.ts's private_feeds mapping, which structurally has no field to
  // put a password in. The password itself never leaves this device.
  touchSync(`privateFeed:${id}`)
  persist()

  return toPublic(record)
}

export function removePrivateFeed(id: string): void {
  const snapshot = getSnapshot()
  delete snapshot.privateFeeds[id]
  delete snapshot.podcasts[id]
  delete snapshot.episodesByPodcast[id]
  touchEpisodes(id)
  delete snapshot.podcastSettings[id]
  // Private feeds are also stored as a regular podcast row (see
  // addPrivateFeed above), so both tombstones need to go out or the podcast
  // row would dangle on every other device.
  touchSyncDelete('podcasts', id, `podcast:${id}`)
  touchSyncDelete('private_feeds', id, `privateFeed:${id}`)
  persist()
}

// Private feeds are persisted as regular podcasts (see addPrivateFeed above),
// so refreshing one is just refreshPodcast with the saved credentials
// attached — reusing it keeps the renderer-push (SUBSCRIPTIONS_UPDATED_EVENT)
// and new-episode notification behavior identical to public feeds.
export function refreshPrivateFeed(id: string): Promise<RefreshOutcome> {
  if (!getSnapshot().privateFeeds[id]) throw new Error(`Private feed ${id} not found`)
  return refreshPodcast(id)
}

// The episode audio files behind a private feed are almost always gated by
// the same credentials as the feed XML itself, but the <audio> element has
// no way to attach an Authorization header — Chromium strips embedded
// user:pass@host credentials from media request URLs. main/index.ts uses
// this to inject the right header at the network layer for any request
// whose host matches a saved private feed, so playback works the same way
// the feed refresh already does.
export function authHeaderForHost(host: string): string | undefined {
  for (const feed of Object.values(getSnapshot().privateFeeds)) {
    let feedHost: string
    try {
      feedHost = new URL(feed.url).host
    } catch {
      continue
    }
    if (feedHost !== host) continue
    const pass = safeStorage.decryptString(Buffer.from(feed.encryptedPassword, 'base64'))
    return `Basic ${Buffer.from(`${feed.user}:${pass}`).toString('base64')}`
  }
  return undefined
}
