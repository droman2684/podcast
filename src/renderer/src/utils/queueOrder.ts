import type { Episode, Podcast } from '@renderer/types'
import { sortEpisodes, sortPodcastsByShowOrder, type QueueSortMode } from '@shared/queueView'

interface QueueOrderInputs {
  queue: string[]
  queueSortMode: QueueSortMode
  showOrder: string[]
  podcasts: Podcast[]
  episodesByPodcast: Record<string, Episode[]>
}

// The queue in the order it actually plays: the stored (manual) order, or
// the chosen sort applied on top of it. The sort is derived at read time and
// never written back to the synced queue, so devices with different sort
// settings can't fight over re-sorting it. Anything that walks the queue for
// "what's next/previous" or displays it in playback order must use this
// rather than raw `queue`. An id whose episode isn't loaded keeps its
// relative order at the end.
//
// Cached on input identity (store slices are replaced, never mutated), so it
// returns the same array between changes — safe as a useAppStore selector.
let cacheInputs: QueueOrderInputs | null = null
let cacheResult: string[] = []
export function getEffectiveQueue(state: QueueOrderInputs): string[] {
  if (state.queueSortMode === 'manual') return state.queue
  const c = cacheInputs
  if (
    c &&
    c.queue === state.queue &&
    c.queueSortMode === state.queueSortMode &&
    c.showOrder === state.showOrder &&
    c.podcasts === state.podcasts &&
    c.episodesByPodcast === state.episodesByPodcast
  ) {
    return cacheResult
  }
  const episodeById = new Map<string, Episode>()
  for (const episodes of Object.values(state.episodesByPodcast)) {
    for (const e of episodes) episodeById.set(e.id, e)
  }
  const known: Episode[] = []
  const unknown: string[] = []
  for (const id of state.queue) {
    const episode = episodeById.get(id)
    if (episode) known.push(episode)
    else unknown.push(id)
  }
  const orderedPodcasts = sortPodcastsByShowOrder(state.podcasts, state.showOrder)
  cacheResult = [...sortEpisodes(known, state.queueSortMode, orderedPodcasts).map((e) => e.id), ...unknown]
  cacheInputs = {
    queue: state.queue,
    queueSortMode: state.queueSortMode,
    showOrder: state.showOrder,
    podcasts: state.podcasts,
    episodesByPodcast: state.episodesByPodcast
  }
  return cacheResult
}
