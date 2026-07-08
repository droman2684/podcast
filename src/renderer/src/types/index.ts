export type {
  Podcast,
  Episode,
  Chapter,
  PrivateFeed,
  PodcastSettings,
  Station,
  StationSort,
  DiscoverPodcast,
  PodcastPreview
} from '@shared/types'

export type Nav = 'home' | 'search' | 'library' | 'episode' | 'queue' | 'stations' | 'feeds'

export type LibraryView = 'grid' | 'list'

export type Speed = 1.0 | 1.5 | 2.0 | 0.75

export type ResizeTarget = 'sidebar' | 'panel'
