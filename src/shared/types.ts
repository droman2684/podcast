// Domain types shared between the main process (source of truth) and the renderer
// (consumer via IPC). Keep these free of any UI-only concerns (nav state, layout, etc.)
// — those stay in src/renderer/src/types/index.ts.

export interface Podcast {
  id: string
  feedUrl: string
  name: string
  author: string
  artworkUrl: string | null
  customArtworkUrl: string | null // user-uploaded override; sticky across feed refreshes
  description: string
  category: string | null
  unread: number
  isPrivate: boolean
}

export interface Episode {
  id: string
  podcastId: string
  title: string
  description: string
  audioUrl: string
  artworkUrl: string | null
  durationSec: number
  pubDateIso: string
  played: boolean
  chaptersUrl: string | null // Podcasting 2.0 <podcast:chapters>, if the feed provides one
}

export interface Chapter {
  title: string
  startTime: number // seconds
  img?: string | null
}

export interface PrivateFeed {
  id: string
  name: string
  url: string
  user: string
  // No password field — the renderer can never hold it, see privateFeeds.ts.
}

export interface PodcastSettings {
  notify: boolean
}

export type StationSort = 'newest' | 'oldest' | 'shortest' | 'longest'

export interface Station {
  id: string
  name: string
  podcastIds: string[]
  sortBy: StationSort
  episodesPerShow: number // 0 = All
}

export interface DiscoverPodcast {
  id: string
  feedUrl: string
  name: string
  author: string
  artworkUrl: string | null
  category: string | null
}

export interface PodcastPreview {
  id: string
  feedUrl: string
  name: string
  author: string
  artworkUrl: string | null
  description: string
  category: string | null
}

// A recent episode surfaced by trendingEpisodes.ts — from a show that's
// currently top-charting in a category, not a measure of real per-episode
// play counts (no public API exposes those). See recommendations.ts for the
// underlying chart data.
export interface TrendingEpisode {
  id: string
  title: string
  audioUrl: string
  artworkUrl: string | null
  durationSec: number
  pubDateIso: string
  podcastId: string
  podcastFeedUrl: string
  podcastName: string
  podcastArtworkUrl: string | null
}
