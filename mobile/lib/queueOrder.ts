import type { Episode, Podcast } from '@shared/types'
import { buildEpisodeIndex } from './episodeIndex'

export type QueueSortMode = 'auto' | 'manual'

// Podcasts in the user's chosen show order (see the store's `showOrder`),
// with any show not in that list yet (subscribed since it was last edited)
// appended afterwards in its existing subscription order.
export function sortPodcastsByShowOrder(podcasts: Podcast[], showOrder: string[]): Podcast[] {
  if (showOrder.length === 0) return podcasts
  const rank = new Map(showOrder.map((id, i) => [id, i]))
  return podcasts
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ra = rank.get(a.p.id) ?? showOrder.length + a.i
      const rb = rank.get(b.p.id) ?? showOrder.length + b.i
      return ra - rb
    })
    .map(({ p }) => p)
}

// Auto order: first by the episode's show's position in the (show-ordered)
// podcast list, then oldest episode first within a show. An id whose
// episode isn't known yet (its feed hasn't loaded) keeps its manual
// relative order at the end rather than jumping around once it loads.
export function autoSortQueue(
  queue: string[],
  episodeIndex: Map<string, Episode>,
  orderedPodcasts: Podcast[]
): string[] {
  const podcastRank = new Map(orderedPodcasts.map((p, i) => [p.id, i]))
  const known: { id: string; rank: number; pub: string; i: number }[] = []
  const unknown: string[] = []
  queue.forEach((id, i) => {
    const episode = episodeIndex.get(id)
    if (!episode) {
      unknown.push(id)
      return
    }
    known.push({ id, rank: podcastRank.get(episode.podcastId) ?? Number.MAX_SAFE_INTEGER, pub: episode.pubDateIso, i })
  })
  known.sort((a, b) => a.rank - b.rank || (a.pub < b.pub ? -1 : a.pub > b.pub ? 1 : a.i - b.i))
  return [...known.map((k) => k.id), ...unknown]
}

interface QueueOrderInputs {
  queue: string[]
  queueSortMode: QueueSortMode
  showOrder: string[]
  podcasts: Podcast[]
  episodesByPodcast: Record<string, Episode[]>
}

// The queue in the order it actually plays: the stored (manual) order, or
// the derived auto order. Anything that walks the queue for "what's
// next/previous" or displays it must use this rather than raw `queue`.
// Cached on input identity (store slices are replaced, never mutated), so
// it returns the same array between changes — safe to pass straight to
// useStore() as a selector.
let cacheInputs: QueueOrderInputs | null = null
let cacheResult: string[] = []
export function getEffectiveQueue(state: QueueOrderInputs): string[] {
  if (state.queueSortMode !== 'auto') return state.queue
  const c = cacheInputs
  if (
    c &&
    c.queue === state.queue &&
    c.showOrder === state.showOrder &&
    c.podcasts === state.podcasts &&
    c.episodesByPodcast === state.episodesByPodcast
  ) {
    return cacheResult
  }
  cacheResult = autoSortQueue(
    state.queue,
    buildEpisodeIndex(state.episodesByPodcast),
    sortPodcastsByShowOrder(state.podcasts, state.showOrder)
  )
  cacheInputs = {
    queue: state.queue,
    queueSortMode: state.queueSortMode,
    showOrder: state.showOrder,
    podcasts: state.podcasts,
    episodesByPodcast: state.episodesByPodcast
  }
  return cacheResult
}
