import type { Episode, Station } from '@shared/types'

const SORTERS: Record<Station['sortBy'], (a: Episode, b: Episode) => number> = {
  newest: (a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1),
  oldest: (a, b) => (a.pubDateIso > b.pubDateIso ? 1 : -1),
  shortest: (a, b) => a.durationSec - b.durationSec,
  longest: (a, b) => b.durationSec - a.durationSec
}

// Mirrors desktop's src/renderer/src/utils/stationEpisodes.ts — stations
// don't store a manual episode list, it's always computed from live
// subscription data using the station's sortBy/episodesPerShow settings.
export function computeStationEpisodes(
  station: Pick<Station, 'podcastIds' | 'sortBy' | 'episodesPerShow'>,
  episodesByPodcast: Record<string, Episode[]>
): Episode[] {
  const perShow: Episode[] = []
  for (const podcastId of station.podcastIds) {
    const episodes = [...(episodesByPodcast[podcastId] ?? [])].sort(SORTERS.newest)
    const capped = station.episodesPerShow > 0 ? episodes.slice(0, station.episodesPerShow) : episodes
    perShow.push(...capped)
  }
  return perShow.sort(SORTERS[station.sortBy])
}
