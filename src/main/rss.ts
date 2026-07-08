import Parser from 'rss-parser'
import { createHash } from 'node:crypto'
import type { Episode, Podcast } from '@shared/types'

interface RssItemExtra {
  itunes?: { duration?: string; image?: string }
  chaptersRaw?: { $?: { url?: string; type?: string } }
}
interface RssFeedExtra {
  itunes?: { image?: string; author?: string; summary?: string; categories?: string[] }
}

const parser = new Parser<RssFeedExtra, RssItemExtra>({
  customFields: {
    item: [['podcast:chapters', 'chaptersRaw']]
  }
})

export function hashId(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16)
}

export function parseItunesDuration(raw?: string): number {
  if (!raw) return 0
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10) // already plain seconds
  const parts = trimmed.split(':').map((p) => parseInt(p, 10))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

export function toEpisode(
  item: Parser.Item & RssItemExtra,
  podcastId: string,
  podcastArtworkUrl: string | null
): Episode {
  const audioUrl = item.enclosure?.url ?? ''
  const id = hashId(item.guid || item.link || audioUrl || item.title || `${podcastId}-${Math.random()}`)
  return {
    id,
    podcastId,
    title: item.title ?? 'Untitled episode',
    description: item.contentSnippet ?? item.content ?? '',
    audioUrl,
    artworkUrl: item.itunes?.image ?? podcastArtworkUrl,
    durationSec: parseItunesDuration(item.itunes?.duration),
    pubDateIso: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
    played: false,
    chaptersUrl: item.chaptersRaw?.$?.url ?? null
  }
}

export interface ParsedFeed {
  podcast: Pick<Podcast, 'name' | 'author' | 'artworkUrl' | 'description' | 'category'>
  episodes: Episode[]
}

export async function parseFeed(
  feedUrl: string,
  authHeader?: string,
  podcastId?: string
): Promise<ParsedFeed> {
  const headers: Record<string, string> = {}
  if (authHeader) headers['Authorization'] = authHeader

  const res = await fetch(feedUrl, { headers })
  if (!res.ok) throw new Error(`Failed to fetch feed (HTTP ${res.status})`)
  const xml = await res.text()
  const feed = await parser.parseString(xml)

  const artworkUrl = feed.itunes?.image ?? feed.image?.url ?? null
  const id = podcastId ?? hashId(feedUrl)
  const episodes = feed.items.map((item) => toEpisode(item, id, artworkUrl))

  return {
    podcast: {
      name: feed.title ?? 'Untitled podcast',
      author: feed.itunes?.author ?? '',
      artworkUrl,
      description: feed.description ?? feed.itunes?.summary ?? '',
      category: feed.itunes?.categories?.[0] ?? null
    },
    episodes
  }
}
