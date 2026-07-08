import { describe, it, expect } from 'vitest'
import { sortEpisodes, groupByPodcast, nextInQueue, previousInQueue } from '../../src/shared/queueView'
import type { Episode } from '../../src/shared/types'

function episode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: Math.random().toString(),
    podcastId: 'p1',
    title: 'Episode',
    description: '',
    audioUrl: 'https://example.com/ep.mp3',
    artworkUrl: null,
    durationSec: 600,
    pubDateIso: '2026-01-01T00:00:00.000Z',
    played: false,
    chaptersUrl: null,
    ...overrides
  }
}

describe('sortEpisodes', () => {
  it('leaves manual order untouched', () => {
    const a = episode({ id: 'a', pubDateIso: '2026-01-03T00:00:00.000Z' })
    const b = episode({ id: 'b', pubDateIso: '2026-01-01T00:00:00.000Z' })
    expect(sortEpisodes([a, b], 'manual')).toEqual([a, b])
  })

  it('sorts newest first by pubDateIso', () => {
    const a = episode({ id: 'a', pubDateIso: '2026-01-01T00:00:00.000Z' })
    const b = episode({ id: 'b', pubDateIso: '2026-01-03T00:00:00.000Z' })
    const c = episode({ id: 'c', pubDateIso: '2026-01-02T00:00:00.000Z' })
    expect(sortEpisodes([a, b, c], 'newest').map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts oldest first by pubDateIso', () => {
    const a = episode({ id: 'a', pubDateIso: '2026-01-01T00:00:00.000Z' })
    const b = episode({ id: 'b', pubDateIso: '2026-01-03T00:00:00.000Z' })
    const c = episode({ id: 'c', pubDateIso: '2026-01-02T00:00:00.000Z' })
    expect(sortEpisodes([a, b, c], 'oldest').map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('sorts shortest first by durationSec', () => {
    const a = episode({ id: 'a', durationSec: 3000 })
    const b = episode({ id: 'b', durationSec: 600 })
    const c = episode({ id: 'c', durationSec: 1800 })
    expect(sortEpisodes([a, b, c], 'shortest').map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts longest first by durationSec', () => {
    const a = episode({ id: 'a', durationSec: 3000 })
    const b = episode({ id: 'b', durationSec: 600 })
    const c = episode({ id: 'c', durationSec: 1800 })
    expect(sortEpisodes([a, b, c], 'longest').map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('does not mutate the input array', () => {
    const a = episode({ id: 'a', durationSec: 3000 })
    const b = episode({ id: 'b', durationSec: 600 })
    const input = [a, b]
    sortEpisodes(input, 'shortest')
    expect(input).toEqual([a, b])
  })
})

describe('groupByPodcast', () => {
  it('groups consecutive and non-consecutive episodes by podcastId', () => {
    const a1 = episode({ id: 'a1', podcastId: 'showA' })
    const b1 = episode({ id: 'b1', podcastId: 'showB' })
    const a2 = episode({ id: 'a2', podcastId: 'showA' })
    const groups = groupByPodcast([a1, b1, a2])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({ podcastId: 'showA', episodes: [a1, a2] })
    expect(groups[1]).toEqual({ podcastId: 'showB', episodes: [b1] })
  })

  it('orders groups by first appearance, preserving prior sort order', () => {
    const b1 = episode({ id: 'b1', podcastId: 'showB' })
    const a1 = episode({ id: 'a1', podcastId: 'showA' })
    const groups = groupByPodcast([b1, a1])
    expect(groups.map((g) => g.podcastId)).toEqual(['showB', 'showA'])
  })

  it('returns an empty array for no episodes', () => {
    expect(groupByPodcast([])).toEqual([])
  })
})

describe('nextInQueue', () => {
  it('returns the episode after the current one', () => {
    expect(nextInQueue(['a', 'b', 'c'], 'a')).toBe('b')
    expect(nextInQueue(['a', 'b', 'c'], 'b')).toBe('c')
  })

  it('returns null when current is the last episode', () => {
    expect(nextInQueue(['a', 'b', 'c'], 'c')).toBeNull()
  })

  it('falls back to the front of the queue when current is not in it', () => {
    expect(nextInQueue(['a', 'b', 'c'], 'not-in-queue')).toBe('a')
    expect(nextInQueue(['a', 'b', 'c'], null)).toBe('a')
  })

  it('returns null for an empty queue', () => {
    expect(nextInQueue([], 'a')).toBeNull()
    expect(nextInQueue([], null)).toBeNull()
  })
})

describe('previousInQueue', () => {
  it('returns the episode before the current one', () => {
    expect(previousInQueue(['a', 'b', 'c'], 'c')).toBe('b')
    expect(previousInQueue(['a', 'b', 'c'], 'b')).toBe('a')
  })

  it('returns null when current is the first episode', () => {
    expect(previousInQueue(['a', 'b', 'c'], 'a')).toBeNull()
  })

  it('returns null when current is not in the queue (no fallback)', () => {
    expect(previousInQueue(['a', 'b', 'c'], 'not-in-queue')).toBeNull()
  })

  it('returns null for an empty queue or no current episode', () => {
    expect(previousInQueue([], 'a')).toBeNull()
    expect(previousInQueue(['a', 'b'], null)).toBeNull()
  })
})
