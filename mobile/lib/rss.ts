import { XMLParser } from 'fast-xml-parser'
import type { Episode } from '@shared/types'
import { hashId } from './hash'

// A separate parser from the desktop app's (src/main/rss.ts, which uses
// Node's rss-parser + node:crypto — neither runs in React Native) but
// deliberately mirrors its field-extraction and id-derivation logic exactly,
// since episode/podcast ids must match across platforms for sync to work.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function parseItunesDuration(raw: unknown): number {
  if (!raw) return 0
  const trimmed = String(raw).trim()
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  const parts = trimmed.split(':').map((p) => parseInt(p, 10))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'])
  }
  return ''
}

function attr(value: unknown, name: string): string | null {
  if (!value || typeof value !== 'object') return null
  const v = (value as Record<string, unknown>)[`@_${name}`]
  return typeof v === 'string' ? v : null
}

export interface ParsedFeed {
  name: string
  author: string
  artworkUrl: string | null
  description: string
  category: string | null
  episodes: Episode[]
}

export async function parseFeed(feedUrl: string, podcastId: string): Promise<ParsedFeed> {
  const res = await fetch(feedUrl)
  if (!res.ok) throw new Error(`Failed to fetch feed (HTTP ${res.status})`)
  const xml = await res.text()
  const data = parser.parse(xml)
  const channel = data?.rss?.channel
  if (!channel) throw new Error('Feed did not parse as RSS')

  const rawItems = channel.item
  const items: Record<string, unknown>[] = Array.isArray(rawItems)
    ? rawItems
    : rawItems
      ? [rawItems]
      : []

  const episodes: Episode[] = []
  for (const item of items) {
    const enclosureUrl = attr(item.enclosure, 'url') ?? ''
    const guid = text(item.guid) || text(item.link) || enclosureUrl || text(item.title)
    if (!guid || !enclosureUrl) continue
    const id = await hashId(guid)
    episodes.push({
      id,
      podcastId,
      title: text(item.title),
      description: text(item.description) || text(item['itunes:summary']),
      audioUrl: enclosureUrl,
      artworkUrl: attr(item['itunes:image'], 'href'),
      durationSec: parseItunesDuration(item['itunes:duration']),
      pubDateIso: item.pubDate ? new Date(text(item.pubDate)).toISOString() : new Date(0).toISOString(),
      played: false,
      chaptersUrl: null
    })
  }

  return {
    name: text(channel.title),
    author: text(channel['itunes:author']) || text(channel.managingEditor),
    artworkUrl: attr(channel['itunes:image'], 'href') ?? text(channel.image?.url) ?? null,
    description: text(channel.description),
    category: attr(channel['itunes:category'], 'text'),
    episodes
  }
}
