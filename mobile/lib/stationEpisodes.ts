import type { Episode, Station } from '@shared/types'

const SORTERS: Record<Exclude<Station['sortBy'], 'manual'>, (a: Episode, b: Episode) => number> = {
  newest: (a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1),
  oldest: (a, b) => (a.pubDateIso > b.pubDateIso ? 1 : -1),
  shortest: (a, b) => a.durationSec - b.durationSec,
  longest: (a, b) => b.durationSec - a.durationSec
}

// Mirrors desktop's src/renderer/src/utils/stationEpisodes.ts, plus mobile's
// own 'manual' sort: desktop stations don't store a manual episode list, but
// mobile does (station.manualOrder, device-local — see store.ts's
// upsertStation comment for why it isn't synced).
export function computeStationEpisodes(
  station: Pick<Station, 'podcastIds' | 'sortBy' | 'episodesPerShow' | 'manualOrder'>,
  episodesByPodcast: Record<string, Episode[]>
): Episode[] {
  const perShow: Episode[] = []
  for (const podcastId of station.podcastIds) {
    const episodes = [...(episodesByPodcast[podcastId] ?? [])].sort(SORTERS.newest)
    const capped = station.episodesPerShow > 0 ? episodes.slice(0, station.episodesPerShow) : episodes
    perShow.push(...capped)
  }

  if (station.sortBy !== 'manual') return perShow.sort(SORTERS[station.sortBy])

  // Manual order: episodes in manualOrder come first, in that order; any
  // episode in the live pool that isn't in manualOrder yet (a new episode
  // from a subscribed show) is appended at the end, newest first.
  const byId = new Map(perShow.map((e) => [e.id, e]))
  const ordered: Episode[] = []
  for (const id of station.manualOrder ?? []) {
    const episode = byId.get(id)
    if (episode) {
      ordered.push(episode)
      byId.delete(id)
    }
  }
  ordered.push(...[...byId.values()].sort(SORTERS.newest))
  return ordered
}
