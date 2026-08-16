import type { DiscoverPodcast, TrendingEpisode } from '@shared/types'
import { hashId } from './hash'
import { parseFeed } from './rss'

// Mirrors the desktop app's src/main/search.ts, recommendations.ts, and
// trendingEpisodes.ts against the same public iTunes endpoints (no auth
// needed) — kept as a separate implementation since it needs hashId() to be
// async here (expo-crypto) where desktop's is sync (node:crypto).

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

async function toDiscoverPodcasts(results: ITunesResult[]): Promise<DiscoverPodcast[]> {
  const withFeeds = results.filter((r): r is ITunesResult & { feedUrl: string } => !!r.feedUrl)
  return Promise.all(
    withFeeds.map(async (r) => ({
      id: await hashId(r.feedUrl),
      feedUrl: r.feedUrl,
      name: r.collectionName,
      author: r.artistName,
      artworkUrl: r.artworkUrl600 ?? null,
      category: r.primaryGenreName ?? null
    }))
  )
}

export async function searchPodcasts(term: string): Promise<DiscoverPodcast[]> {
  const trimmed = term.trim()
  if (!trimmed) return []
  const url = `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=25&term=${encodeURIComponent(trimmed)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`iTunes search failed (HTTP ${res.status})`)
  const data = (await res.json()) as ITunesResponse
  return toDiscoverPodcasts(data.results)
}

export const CATEGORY_GENRE_IDS: Record<string, string> = {
  News: '1489',
  Technology: '1318',
  Comedy: '1303',
  'True Crime': '1488',
  History: '1487',
  Science: '1533',
  Business: '1321',
  'Health & Fitness': '1512',
  MLB: '1549',
  NBA: '1548',
  NFL: '1547'
}

interface ChartEntry {
  id: { attributes: { 'im:id': string } }
}
interface ChartResponse {
  feed: { entry?: ChartEntry | ChartEntry[] }
}

const CHART_LIMIT = 100
const LOOKUP_BATCH = 100
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const chartCache = new Map<string, { fetchedAt: number; items: DiscoverPodcast[] }>()

async function fetchChartIds(genreId: string): Promise<string[]> {
  const res = await fetch(
    `https://itunes.apple.com/us/rss/toppodcasts/limit=${CHART_LIMIT}/genre=${genreId}/json`
  )
  if (!res.ok) throw new Error(`Top charts request failed (HTTP ${res.status})`)
  const data = (await res.json()) as ChartResponse
  const entries = data.feed.entry
  const list = Array.isArray(entries) ? entries : entries ? [entries] : []
  return list.map((e) => e.id.attributes['im:id'])
}

async function resolveFeedUrls(ids: string[]): Promise<DiscoverPodcast[]> {
  if (ids.length === 0) return []
  const res = await fetch(`https://itunes.apple.com/lookup?id=${ids.join(',')}&entity=podcast`)
  if (!res.ok) throw new Error(`iTunes lookup failed (HTTP ${res.status})`)
  const data = (await res.json()) as ITunesResponse & { results: (ITunesResult & { collectionId: number })[] }
  const byId = new Map(data.results.map((r) => [String(r.collectionId), r]))
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is ITunesResult => !!r)
  return toDiscoverPodcasts(ordered)
}

export async function getTopPodcasts(category: string): Promise<DiscoverPodcast[]> {
  const genreId = CATEGORY_GENRE_IDS[category]
  if (!genreId) throw new Error(`Unknown category: ${category}`)
  const cached = chartCache.get(genreId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items
  const ids = await fetchChartIds(genreId)
  const items: DiscoverPodcast[] = []
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) {
    items.push(...(await resolveFeedUrls(ids.slice(i, i + LOOKUP_BATCH))))
  }
  chartCache.set(genreId, { fetchedAt: Date.now(), items })
  return items
}

function sample<T>(arr: T[], count: number): T[] {
  const copy = [...arr]
  const picked: T[] = []
  while (picked.length < count && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length)
    picked.push(copy.splice(idx, 1)[0])
  }
  return picked
}

export async function getCategoryPicks(category: string, count = 6): Promise<DiscoverPodcast[]> {
  return sample(await getTopPodcasts(category), count)
}

const WINDOW_MS = 72 * 60 * 60 * 1000
const SCAN_LIMIT = 40
const FETCH_CONCURRENCY = 6
const RESULT_COUNT = 10
const TRENDING_CACHE_TTL_MS = 30 * 60 * 1000
const trendingCache = new Map<string, { fetchedAt: number; items: TrendingEpisode[] }>()

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map(fn))))
  }
  return results
}

export async function getTrendingEpisodes(category: string): Promise<TrendingEpisode[]> {
  const cached = trendingCache.get(category)
  if (cached && Date.now() - cached.fetchedAt < TRENDING_CACHE_TTL_MS) return cached.items

  const shows = (await getTopPodcasts(category)).slice(0, SCAN_LIMIT)
  const cutoff = Date.now() - WINDOW_MS

  const perShow = await mapWithConcurrency(shows, FETCH_CONCURRENCY, async (show) => {
    try {
      const parsed = await parseFeed(show.feedUrl, show.id)
      const recent = parsed.episodes
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

  const items = perShow.filter((e): e is TrendingEpisode => !!e).slice(0, RESULT_COUNT)
  trendingCache.set(category, { fetchedAt: Date.now(), items })
  return items
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}
function hashStringToInt(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export async function getPodcastOfTheDay(): Promise<DiscoverPodcast> {
  const today = todayKey()
  const categories = Object.keys(CATEGORY_GENRE_IDS)
  const category = categories[hashStringToInt(today) % categories.length]
  const items = await getTopPodcasts(category)
  return items[hashStringToInt(today + category) % items.length]
}
