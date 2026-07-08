import type { DiscoverPodcast, Episode, PodcastPreview } from '@shared/types'
import { hashId, parseFeed } from './rss'

interface ITunesResult {
  collectionId: number
  collectionName: string
  artistName: string
  feedUrl?: string
  artworkUrl600?: string
  primaryGenreName?: string
}

interface ITunesResponse {
  results: ITunesResult[]
}

export async function searchPodcasts(term: string): Promise<DiscoverPodcast[]> {
  const trimmed = term.trim()
  if (!trimmed) return []

  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=25&term=${encodeURIComponent(trimmed)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes search failed (HTTP ${res.status})`)
  const data = (await res.json()) as ITunesResponse

  return data.results
    .filter((r) => !!r.feedUrl)
    .map((r) => ({
      id: hashId(r.feedUrl as string),
      feedUrl: r.feedUrl as string,
      name: r.collectionName,
      author: r.artistName,
      artworkUrl: r.artworkUrl600 ?? null,
      category: r.primaryGenreName ?? null
    }))
}

const PREVIEW_EPISODE_LIMIT = 10

// A read-only look at a feed before subscribing — does not touch persisted
// state at all. Episode ids are derived the exact same way subscribe() does
// (hashId(feedUrl) as the podcast id), so if the user does subscribe
// afterward, these preview episodes line up with the real ones instead of
// being orphaned duplicates.
export async function previewPodcast(
  feedUrl: string
): Promise<{ podcast: PodcastPreview; episodes: Episode[] }> {
  const id = hashId(feedUrl)
  const { podcast, episodes } = await parseFeed(feedUrl, undefined, id)
  const sorted = [...episodes].sort((a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1))
  return {
    podcast: { id, feedUrl, ...podcast },
    episodes: sorted.slice(0, PREVIEW_EPISODE_LIMIT)
  }
}
