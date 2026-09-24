import type { Episode, Podcast } from './types'

// 'show' = the user's show ranking (QueuePrefs.showOrder), then oldest
// episode first within a show — the desktop equivalent of mobile's Auto mode.
export type QueueSortMode = 'manual' | 'show' | 'newest' | 'oldest' | 'shortest' | 'longest'

export const QUEUE_SORT_MODES: QueueSortMode[] = ['manual', 'show', 'newest', 'oldest', 'shortest', 'longest']

export type QueueViewMode = 'grid' | 'list'

export interface QueuePrefs {
  sortMode: QueueSortMode
  groupByShow: boolean
  queueView: QueueViewMode
  // Podcast ids, first = top. Device-local: queue_prefs' synced row only
  // carries the three fields above, so this never leaves the machine.
  showOrder?: string[]
}

export const DEFAULT_QUEUE_PREFS: QueuePrefs = {
  sortMode: 'manual',
  groupByShow: false,
  queueView: 'list'
}

// Podcasts in the user's chosen show order, with any show not in that list
// yet (subscribed since it was last edited) appended afterwards in its
// existing subscription order.
export function sortPodcastsByShowOrder(podcasts: Podcast[], showOrder: string[]): Podcast[] {
  if (showOrder.length === 0) return podcasts
  const rank = new Map(showOrder.map((id, i) => [id, i]))
  return podcasts
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) => (rank.get(a.p.id) ?? showOrder.length + a.i) - (rank.get(b.p.id) ?? showOrder.length + b.i)
    )
    .map(({ p }) => p)
}

// `orderedPodcasts` is only consulted for 'show' mode (pass the result of
// sortPodcastsByShowOrder). Sorts are stable, so ties keep queue order.
export function sortEpisodes(
  episodes: Episode[],
  mode: QueueSortMode,
  orderedPodcasts: Podcast[] = []
): Episode[] {
  if (mode === 'manual') return episodes
  const sorted = [...episodes]
  switch (mode) {
    case 'show': {
      const rank = new Map(orderedPodcasts.map((p, i) => [p.id, i]))
      const r = (e: Episode): number => rank.get(e.podcastId) ?? Number.MAX_SAFE_INTEGER
      sorted.sort(
        (a, b) => r(a) - r(b) || (a.pubDateIso < b.pubDateIso ? -1 : a.pubDateIso > b.pubDateIso ? 1 : 0)
      )
      break
    }
    case 'newest':
      sorted.sort((a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1))
      break
    case 'oldest':
      sorted.sort((a, b) => (a.pubDateIso > b.pubDateIso ? 1 : -1))
      break
    case 'shortest':
      sorted.sort((a, b) => a.durationSec - b.durationSec)
      break
    case 'longest':
      sorted.sort((a, b) => b.durationSec - a.durationSec)
      break
  }
  return sorted
}

// The episode id to jump to via a "next track" control, or null if there
// isn't one. Falls back to the front of the queue when the current episode
// isn't part of it at all (e.g. it was played from Search/Episode screen).
export function nextInQueue(queue: string[], currentEpisodeId: string | null): string | null {
  if (queue.length === 0) return null
  if (currentEpisodeId === null) return queue[0]
  const idx = queue.indexOf(currentEpisodeId)
  if (idx === -1) return queue[0]
  return idx + 1 < queue.length ? queue[idx + 1] : null
}

// The episode id to jump to via a "previous track" control, or null if
// there isn't one — unlike nextInQueue there's no sensible fallback here,
// since "previous" only means something relative to a known queue position.
export function previousInQueue(queue: string[], currentEpisodeId: string | null): string | null {
  if (queue.length === 0 || currentEpisodeId === null) return null
  const idx = queue.indexOf(currentEpisodeId)
  if (idx <= 0) return null
  return queue[idx - 1]
}

export interface EpisodeGroup {
  podcastId: string
  episodes: Episode[]
}

// Groups preserve the order episodes already appear in (post-sort) — a
// group's position is determined by where its first member falls, not by
// podcast name or id, so "group by show" never disturbs the chosen sort.
export function groupByPodcast(episodes: Episode[]): EpisodeGroup[] {
  const groups: EpisodeGroup[] = []
  const indexByPodcastId = new Map<string, number>()
  for (const episode of episodes) {
    let idx = indexByPodcastId.get(episode.podcastId)
    if (idx === undefined) {
      idx = groups.length
      indexByPodcastId.set(episode.podcastId, idx)
      groups.push({ podcastId: episode.podcastId, episodes: [] })
    }
    groups[idx].episodes.push(episode)
  }
  return groups
}
