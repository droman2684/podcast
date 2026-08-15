import type {
  Podcast,
  Episode,
  PrivateFeed,
  PodcastSettings,
  Station,
  StationSort,
  DiscoverPodcast,
  PodcastPreview,
  Chapter,
  TrendingEpisode
} from './types'
import type { QueuePrefs } from './queueView'

export const IPC_CHANNELS = {
  SEARCH_PODCASTS: 'search:podcasts',
  SEARCH_PREVIEW: 'search:preview',

  RECOMMENDATIONS_CATEGORY_PICKS: 'recommendations:categoryPicks',
  RECOMMENDATIONS_KEYWORD_PICKS: 'recommendations:keywordPicks',
  RECOMMENDATIONS_DAILY_PICK: 'recommendations:dailyPick',
  RECOMMENDATIONS_TRENDING_EPISODES: 'recommendations:trendingEpisodes',

  SUBSCRIPTIONS_LIST: 'subscriptions:list',
  SUBSCRIPTIONS_SUBSCRIBE: 'subscriptions:subscribe',
  SUBSCRIPTIONS_UNSUBSCRIBE: 'subscriptions:unsubscribe',
  SUBSCRIPTIONS_REFRESH: 'subscriptions:refresh',
  SUBSCRIPTIONS_REFRESH_ALL: 'subscriptions:refreshAll',
  SUBSCRIPTIONS_SET_ARTWORK: 'subscriptions:setArtwork',
  SUBSCRIPTIONS_IMPORT_OPML: 'subscriptions:importOpml',

  EPISODES_LIST: 'episodes:list',
  EPISODES_MARK_PLAYED: 'episodes:markPlayed',
  EPISODES_SET_DURATION: 'episodes:setDuration',
  EPISODES_GET_CHAPTERS: 'episodes:getChapters',

  QUEUE_GET: 'queue:get',
  QUEUE_SET: 'queue:set',
  QUEUE_PREFS_GET: 'queue:getPrefs',
  QUEUE_PREFS_SET: 'queue:setPrefs',

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

  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',

  AUTH_SIGN_UP_WITH_PASSWORD: 'auth:signUpWithPassword',
  AUTH_SIGN_IN_WITH_PASSWORD: 'auth:signInWithPassword',
  AUTH_SIGN_OUT: 'auth:signOut',
  AUTH_GET_STATE: 'auth:getState',

  SYNC_NOW: 'sync:now',

  SUBSCRIPTIONS_UPDATED_EVENT: 'subscriptions:updated',
  SYNC_STATUS_EVENT: 'sync:status',
  AUTH_STATE_CHANGED_EVENT: 'auth:stateChanged',
  // Cloud account sync (this app <-> Supabase). Named distinctly from
  // SYNC_STATUS_EVENT above, which is the unrelated "RSS feeds are
  // refreshing" indicator that predates cloud sync entirely.
  SYNC_STATE_EVENT: 'sync:state'
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

export interface SyncStatusPayload {
  status: 'syncing' | 'idle'
  newEpisodeCount?: number
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

export interface UpdateCheckResult {
  available: boolean
}

export interface OpmlImportResult {
  imported: Podcast[]
  skipped: number
  failed: { feedUrl: string; error: string }[]
}

export interface AuthState {
  signedIn: boolean
  email: string | null
}

export type SyncPhase = 'idle' | 'syncing' | 'error'

export interface SyncStatePayload {
  phase: SyncPhase
  lastSyncedAt: number | null
  error?: string
}

export interface EmpirePodApi {
  search: {
    podcasts(term: string): Promise<DiscoverPodcast[]>
    preview(feedUrl: string): Promise<PreviewResult>
  }
  recommendations: {
    categoryPicks(category: string): Promise<DiscoverPodcast[]>
    keywordPicks(term: string): Promise<DiscoverPodcast[]>
    dailyPick(): Promise<DiscoverPodcast>
    trendingEpisodes(category: string): Promise<TrendingEpisode[]>
  }
  subscriptions: {
    list(): Promise<Podcast[]>
    subscribe(feedUrl: string): Promise<Podcast>
    unsubscribe(podcastId: string): Promise<void>
    refresh(podcastId: string): Promise<RefreshResult>
    refreshAll(): Promise<RefreshAllResult>
    setArtwork(podcastId: string, dataUrl: string | null): Promise<Podcast>
    importOpml(): Promise<OpmlImportResult | null>
    onUpdated(callback: (payload: SubscriptionUpdatedPayload) => void): () => void
    onSyncStatus(callback: (payload: SyncStatusPayload) => void): () => void
  }
  episodes: {
    list(podcastId: string): Promise<Episode[]>
    markPlayed(episodeId: string, played: boolean): Promise<void>
    setDuration(episodeId: string, durationSec: number): Promise<void>
    getChapters(chaptersUrl: string): Promise<Chapter[]>
  }
  queue: {
    get(): Promise<string[]>
    set(episodeIds: string[]): Promise<void>
    getPrefs(): Promise<QueuePrefs | null>
    setPrefs(prefs: QueuePrefs): Promise<void>
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
    refresh(id: string): Promise<RefreshResult>
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
  update: {
    check(): Promise<UpdateCheckResult>
    install(): Promise<void>
  }
  auth: {
    signUpWithPassword(email: string, password: string): Promise<AuthState>
    signInWithPassword(email: string, password: string): Promise<AuthState>
    signOut(): Promise<void>
    getState(): Promise<AuthState>
    onStateChanged(callback: (state: AuthState) => void): () => void
  }
  sync: {
    now(): Promise<void>
    onState(callback: (payload: SyncStatePayload) => void): () => void
  }
}
