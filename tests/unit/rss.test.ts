import { describe, it, expect } from 'vitest'
import { parseItunesDuration, toEpisode, hashId } from '../../src/main/rss'

describe('parseItunesDuration', () => {
  it('parses HH:MM:SS', () => {
    expect(parseItunesDuration('00:22:26')).toBe(1346)
  })

  it('parses MM:SS', () => {
    expect(parseItunesDuration('45:12')).toBe(2712)
  })

  it('parses plain seconds', () => {
    expect(parseItunesDuration('3661')).toBe(3661)
  })

  it('returns 0 for missing/invalid input', () => {
    expect(parseItunesDuration(undefined)).toBe(0)
    expect(parseItunesDuration('')).toBe(0)
    expect(parseItunesDuration('not-a-duration')).toBe(0)
  })
})

describe('hashId', () => {
  it('is deterministic', () => {
    expect(hashId('https://example.com/feed')).toBe(hashId('https://example.com/feed'))
  })

  it('differs for different inputs', () => {
    expect(hashId('a')).not.toBe(hashId('b'))
  })
})

describe('toEpisode', () => {
  it('maps an RSS item into an Episode, preferring item-level itunes fields', () => {
    const item = {
      title: 'Episode One',
      guid: 'guid-1',
      link: 'https://example.com/ep1',
      contentSnippet: 'A summary',
      isoDate: '2026-01-01T00:00:00.000Z',
      enclosure: { url: 'https://example.com/ep1.mp3', length: 123, type: 'audio/mpeg' },
      itunes: { duration: '00:10:00', image: 'https://example.com/ep1-art.jpg' }
    }
    const episode = toEpisode(item, 'podcast-1', 'https://example.com/podcast-art.jpg')

    expect(episode.podcastId).toBe('podcast-1')
    expect(episode.title).toBe('Episode One')
    expect(episode.audioUrl).toBe('https://example.com/ep1.mp3')
    expect(episode.artworkUrl).toBe('https://example.com/ep1-art.jpg')
    expect(episode.durationSec).toBe(600)
    expect(episode.pubDateIso).toBe('2026-01-01T00:00:00.000Z')
    expect(episode.played).toBe(false)
  })

  it('falls back to the podcast artwork when the item has none', () => {
    const item = { title: 'No Art', enclosure: { url: 'https://example.com/x.mp3' } }
    const episode = toEpisode(item, 'podcast-1', 'https://example.com/podcast-art.jpg')
    expect(episode.artworkUrl).toBe('https://example.com/podcast-art.jpg')
  })

  it('produces a stable id for the same guid', () => {
    const item = { title: 'X', guid: 'stable-guid', enclosure: { url: 'https://x/y.mp3' } }
    const a = toEpisode(item, 'p1', null)
    const b = toEpisode(item, 'p1', null)
    expect(a.id).toBe(b.id)
  })
})
