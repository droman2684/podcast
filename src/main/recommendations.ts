import type { DiscoverPodcast } from '@shared/types'
import { hashId } from './rss'
import { getSnapshot, persist } from './persistence'
import { searchPodcasts } from './search'

// Apple Podcasts genre ids for the same categories shown as chips on the
// Search screen (src/renderer/src/data/categories.ts) — kept in sync by hand
// since one lives in main and the other in renderer. Verified against Apple's
// public charts/lookup endpoints (each id's top show matches the category).
// MLB/NBA/NFL map to Apple's Baseball/Basketball/Football subgenres — Apple
// has no team-league-specific genres, but each league dominates its sport's
// chart in practice.
const CATEGORY_GENRE_IDS: Record<string, string> = {
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

function listRecommendationCategories(): string[] {
  return Object.keys(CATEGORY_GENRE_IDS)
}

export function isRecommendationCategory(category: string): boolean {
  return category in CATEGORY_GENRE_IDS
}

interface ChartEntry {
  id: { attributes: { 'im:id': string } }
}
interface ChartResponse {
  feed: { entry?: ChartEntry | ChartEntry[] }
}

interface LookupResult {
  collectionId: number
  collectionName: string
  artistName: string
  feedUrl?: string
  artworkUrl600?: string
  primaryGenreName?: string
}
interface LookupResponse {
  results: LookupResult[]
}

const CHART_LIMIT = 100
const LOOKUP_BATCH = 100
// Apple's charts don't reshuffle fast enough to justify refetching on every
// screen visit — cache each category's resolved top 100 for a day.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const chartCache = new Map<string, { fetchedAt: number; items: DiscoverPodcast[] }>()

async function fetchChartIds(genreId: string): Promise<string[]> {
  const res = await fetch(`https://itunes.apple.com/us/rss/toppodcasts/limit=${CHART_LIMIT}/genre=${genreId}/json`)
  if (!res.ok) throw new Error(`Top charts request failed (HTTP ${res.status})`)
  const data = (await res.json()) as ChartResponse
  const entries = data.feed.entry
  // Apple's chart JSON returns a bare object instead of a 1-item array when
  // there's exactly one entry — normalize both shapes.
  const list = Array.isArray(entries) ? entries : entries ? [entries] : []
  return list.map((e) => e.id.attributes['im:id'])
}

async function resolveFeedUrls(ids: string[]): Promise<DiscoverPodcast[]> {
  if (ids.length === 0) return []
  const res = await fetch(`https://itunes.apple.com/lookup?id=${ids.join(',')}&entity=podcast`)
  if (!res.ok) throw new Error(`iTunes lookup failed (HTTP ${res.status})`)
  const data = (await res.json()) as LookupResponse
  const byId = new Map(data.results.map((r) => [String(r.collectionId), r]))
  // Re-order by the original chart-rank id list — the lookup endpoint does not
  // promise to return results in request order, but callers that care about
  // chart rank (e.g. trending episodes) need the top-ranked show first.
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is LookupResult => !!r && !!r.feedUrl)
    .map((r) => ({
      id: hashId(r.feedUrl as string),
      feedUrl: r.feedUrl as string,
      name: r.collectionName,
      author: r.artistName,
      artworkUrl: r.artworkUrl600 ?? null,
      category: r.primaryGenreName ?? null
    }))
}

// Chart-rank order (best show first) — used both for the random sampling
// below and for trendingEpisodes.ts, which needs rank order to mean something.
export async function getTopPodcasts(category: string): Promise<DiscoverPodcast[]> {
  const genreId = CATEGORY_GENRE_IDS[category]
  if (!genreId) throw new Error(`Unknown recommendation category: ${category}`)

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

export async function getCategoryPicks(category: string, count = 3): Promise<DiscoverPodcast[]> {
  const items = await getTopPodcasts(category)
  return sample(items, count)
}

export async function getKeywordPicks(term: string, count = 3): Promise<DiscoverPodcast[]> {
  const results = await searchPodcasts(term)
  return sample(results, count)
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

// Simple deterministic string hash (not cryptographic) — only needs to spread
// a date string across an index range consistently, so the same day always
// re-derives the same pick even if the persisted value is somehow lost.
function hashStringToInt(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export async function getPodcastOfTheDay(): Promise<DiscoverPodcast> {
  const today = todayKey()
  const snapshot = getSnapshot()
  if (snapshot.dailyPick && snapshot.dailyPick.date === today) return snapshot.dailyPick.podcast

  const categories = listRecommendationCategories()
  const category = categories[hashStringToInt(today) % categories.length]
  const items = await getTopPodcasts(category)
  const podcast = items[hashStringToInt(today + category) % items.length]

  snapshot.dailyPick = { date: today, podcast }
  persist()
  return podcast
}
