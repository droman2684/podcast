import type { TrendingEpisode } from '@shared/types'
import { getTopPodcasts, isRecommendationCategory } from './recommendations'
import { parseFeed } from './rss'

const WINDOW_MS = 72 * 60 * 60 * 1000
// How far down the category's chart to look for shows with a recent episode.
// Most categories fill 10 slots well within this; a niche category may not.
const SCAN_LIMIT = 40
const FETCH_CONCURRENCY = 6
const RESULT_COUNT = 10
// Charts don't reshuffle fast enough, but new episodes do — refresh far more
// often than the 24h chart cache in recommendations.ts.
const CACHE_TTL_MS = 30 * 60 * 1000

const trendingCache = new Map<string, { fetchedAt: number; items: TrendingEpisode[] }>()

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    results.push(...(await Promise.all(batch.map(fn))))
  }
  return results
}

export async function getTrendingEpisodes(category: string): Promise<TrendingEpisode[]> {
  if (!isRecommendationCategory(category)) throw new Error(`Unknown recommendation category: ${category}`)

  const cached = trendingCache.get(category)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items

  const shows = (await getTopPodcasts(category)).slice(0, SCAN_LIMIT)
  const cutoff = Date.now() - WINDOW_MS

  // Each show contributes at most its single newest episode within the
  // window, so results stay ranked by chart position rather than getting
  // dominated by one prolific feed. Feed fetch failures are skipped, not
  // fatal — a category shouldn't come back empty because one show's feed
  // timed out.
  const perShow = await mapWithConcurrency(shows, FETCH_CONCURRENCY, async (show) => {
    try {
      const { episodes } = await parseFeed(show.feedUrl, undefined, show.id)
      const recent = episodes
        .filter((e) => e.audioUrl && new Date(e.pubDateIso).getTime() >= cutoff)
        .sort((a, b) => new Date(b.pubDateIso).getTime() - new Date(a.pubDateIso).getTime())[0]
      if (!recent) return null
      const item: TrendingEpisode = {
        id: recent.id,
        title: recent.title,
        audioUrl: recent.audioUrl,
        artworkUrl: recent.artworkUrl,
        durationSec: recent.durationSec,
        pubDateIso: recent.pubDateIso,
        podcastId: show.id,
        podcastFeedUrl: show.feedUrl,
        podcastName: show.name,
        podcastArtworkUrl: show.artworkUrl
      }
      return item
    } catch (err) {
      console.error(`Failed to fetch feed for trending episodes (${show.feedUrl}):`, err)
      return null
    }
  })

  // shows is already in chart-rank order and perShow preserves that order,
  // so the first RESULT_COUNT hits are the highest-ranked shows with a
  // recent episode.
  const items = perShow.filter((e): e is TrendingEpisode => !!e).slice(0, RESULT_COUNT)
  trendingCache.set(category, { fetchedAt: Date.now(), items })
  return items
}
