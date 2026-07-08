import { describe, it, expect } from 'vitest'
import { normalize, type PersistedData } from '../../src/main/persistence'

function baseData(overrides: Partial<PersistedData> = {}): PersistedData {
  return {
    version: 1,
    podcasts: {},
    episodesByPodcast: {},
    queue: [],
    currentEpisodeId: null,
    playbackPositions: {},
    privateFeeds: {},
    podcastSettings: {},
    stations: {},
    windowBounds: null,
    columnLayout: null,
    ...overrides
  }
}

describe('normalize', () => {
  it('passes through well-formed stations unchanged', () => {
    const data = baseData({
      stations: {
        s1: { id: 's1', name: 'Mix', podcastIds: ['p1'], sortBy: 'longest', episodesPerShow: 3 }
      }
    })
    expect(normalize(data).stations.s1).toEqual(data.stations.s1)
  })

  it('upgrades a legacy episodeIds-only station instead of crashing', () => {
    const data = baseData({
      // Shape from before the podcast-based station redesign.
      stations: { s1: { id: 's1', name: 'Old Mix', episodeIds: ['e1', 'e2'] } as never }
    })
    const result = normalize(data).stations.s1
    expect(result.podcastIds).toEqual([])
    expect(result.sortBy).toBe('newest')
    expect(result.episodesPerShow).toBe(5)
    expect(result.name).toBe('Old Mix')
  })

  it('rejects an invalid sortBy value', () => {
    const data = baseData({
      stations: { s1: { id: 's1', name: 'X', podcastIds: [], sortBy: 'bogus' as never, episodesPerShow: 5 } }
    })
    expect(normalize(data).stations.s1.sortBy).toBe('newest')
  })

  it('strips legacy podcastSettings fields down to just notify', () => {
    const data = baseData({
      podcastSettings: {
        p1: { keep: 5, autoDownload: true, autoDeleteAfterPlay: true, notify: true } as never
      }
    })
    expect(normalize(data).podcastSettings.p1).toEqual({ notify: true })
  })

  it('defaults notify to false when missing', () => {
    const data = baseData({ podcastSettings: { p1: {} as never } })
    expect(normalize(data).podcastSettings.p1).toEqual({ notify: false })
  })

  it('passes through well-formed windowBounds', () => {
    const data = baseData({ windowBounds: { x: 10, y: 20, width: 1280, height: 800 } })
    expect(normalize(data).windowBounds).toEqual({ x: 10, y: 20, width: 1280, height: 800 })
  })

  it('coerces malformed windowBounds to null', () => {
    expect(normalize(baseData({ windowBounds: { width: 1280, height: 800 } as never })).windowBounds).toBeNull()
    expect(normalize(baseData({ windowBounds: 'nope' as never })).windowBounds).toBeNull()
  })

  it('passes through well-formed columnLayout', () => {
    const data = baseData({ columnLayout: { sidebarW: 260, mainContentW: 360 } })
    expect(normalize(data).columnLayout).toEqual({ sidebarW: 260, mainContentW: 360 })
  })

  it('coerces malformed columnLayout to null', () => {
    expect(normalize(baseData({ columnLayout: { sidebarW: 260 } as never })).columnLayout).toBeNull()
    expect(normalize(baseData({ columnLayout: 'nope' as never })).columnLayout).toBeNull()
  })

  it('keeps queue entries that resolve to a loaded episode', () => {
    const data = baseData({
      episodesByPodcast: { p1: [{ id: 'e1' } as never, { id: 'e2' } as never] },
      queue: ['e1', 'e2']
    })
    expect(normalize(data).queue).toEqual(['e1', 'e2'])
  })

  it('drops stale queue entries left behind by an unsubscribed podcast', () => {
    const data = baseData({
      episodesByPodcast: { p1: [{ id: 'e1' } as never] },
      queue: ['e1', 'ghost-from-unsubscribed-show', 'e1']
    })
    expect(normalize(data).queue).toEqual(['e1', 'e1'])
  })

  it('coerces a missing or malformed queue to an empty array', () => {
    expect(normalize(baseData({ queue: undefined as never })).queue).toEqual([])
    expect(normalize(baseData({ queue: 'e1' as never })).queue).toEqual([])
  })
})
