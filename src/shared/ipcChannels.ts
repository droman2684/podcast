import type {
  Podcast,
  Episode,
  PrivateFeed,
  PodcastSettings,
  Station,
  StationSort,
  DiscoverPodcast,
  PodcastPreview,
  Chapter
} from './types'

export const IPC_CHANNELS = {
  SEARCH_PODCASTS: 'search:podcasts',
  SEARCH_PREVIEW: 'search:preview',

  SUBSCRIPTIONS_LIST: 'subscriptions:list',
  SUBSCRIPTIONS_SUBSCRIBE: 'subscriptions:subscribe',
  SUBSCRIPTIONS_UNSUBSCRIBE: 'subscriptions:unsubscribe',
  SUBSCRIPTIONS_REFRESH: 'subscriptions:refresh',
  SUBSCRIPTIONS_REFRESH_ALL: 'subscriptions:refreshAll',
  SUBSCRIPTIONS_SET_ARTWORK: 'subscriptions:setArtwork',

  EPISODES_LIST: 'episodes:list',
  EPISODES_MARK_PLAYED: 'episodes:markPlayed',
  EPISODES_GET_CHAPTERS: 'episodes:getChapters',

  QUEUE_GET: 'queue:get',
  QUEUE_SET: 'queue:set',

  PLAYBACK_GET_POSITION: 'playback:getPosition',
  PLAYBACK_SAVE_POSITION: 'playback:savePosition',
  PLAYBACK_GET_ALL_POSITIONS: 'playback:getAllPositions',

  PRIVATE_FEEDS_LIST: 'privateFeeds:list',
  PRIVATE_FEEDS_ADD: 'privateFeeds:add',
  PRIVATE_FEEDS_REMOVE: 'privateFeeds:remove',
  PRIVATE_FEEDS_REFRESH: 'privateFeeds:refresh',

  PODCAST_SETTINGS_GET: 'podcastSettings:get',
  PODCAST_SETTINGS_SET: 'podcastSettings:set',

  STATIONS_LIST: 'stations:list',
  STATIONS_CREATE: 'stations:create',
  STATIONS_DELETE: 'stations:delete',
  STATIONS_ADD_PODCAST: 'stations:addPodcast',
  STATIONS_REMOVE_PODCAST: 'stations:removePodcast',
  STATIONS_UPDATE_SETTINGS: 'stations:updateSettings',

  LAYOUT_GET: 'layout:get',
  LAYOUT_SET: 'layout:set',

  SUBSCRIPTIONS_UPDATED_EVENT: 'subscriptions:updated'
} as const

export interface RefreshResult {
  podcast: Podcast
  episodes: Episode[]
  newEpisodeCount: number
}

export interface RefreshAllResult {
  results: { podcastId: string; newEpisodeCount: number }[]
}

export interface SubscriptionUpdatedPayload {
  podcast: Podcast
  episodes: Episode[]
}

export interface StationSettingsPatch {
  name?: string
  sortBy?: StationSort
  episodesPerShow?: number
}

export interface ColumnLayout {
  sidebarW: number
  mainContentW: number
}

export interface PreviewResult {
  podcast: PodcastPreview
  episodes: Episode[]
}

export interface EmpirePodApi {
  search: {
    podcasts(term: string): Promise<DiscoverPodcast[]>
    preview(feedUrl: string): Promise<PreviewResult>
  }
  subscriptions: {
    list(): Promise<Podcast[]>
    subscribe(feedUrl: string): Promise<Podcast>
    unsubscribe(podcastId: string): Promise<void>
    refresh(podcastId: string): Promise<RefreshResult>
    refreshAll(): Promise<RefreshAllResult>
    setArtwork(podcastId: string, dataUrl: string | null): Promise<Podcast>
    onUpdated(callback: (payload: SubscriptionUpdatedPayload) => void): () => void
  }
  episodes: {
    list(podcastId: string): Promise<Episode[]>
    markPlayed(episodeId: string, played: boolean): Promise<void>
    getChapters(chaptersUrl: string): Promise<Chapter[]>
  }
  queue: {
    get(): Promise<string[]>
    set(episodeIds: string[]): Promise<void>
  }
  playback: {
    getPosition(episodeId: string): Promise<number>
    savePosition(episodeId: string, positionSec: number): Promise<void>
    getAllPositions(): Promise<Record<string, number>>
  }
  privateFeeds: {
    list(): Promise<PrivateFeed[]>
    add(url: string, user: string, pass: string): Promise<PrivateFeed>
    remove(id: string): Promise<void>
    refresh(id: string): Promise<{ episodes: Episode[] }>
  }
  podcastSettings: {
    get(podcastId: string): Promise<PodcastSettings>
    set(podcastId: string, patch: Partial<PodcastSettings>): Promise<PodcastSettings>
  }
  stations: {
    list(): Promise<Station[]>
    create(name: string): Promise<Station>
    delete(stationId: string): Promise<void>
    addPodcast(stationId: string, podcastId: string): Promise<Station>
    removePodcast(stationId: string, podcastId: string): Promise<Station>
    updateSettings(stationId: string, patch: StationSettingsPatch): Promise<Station>
  }
  layout: {
    get(): Promise<ColumnLayout | null>
    set(layout: ColumnLayout): Promise<void>
  }
}
