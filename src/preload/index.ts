import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '@shared/ipcChannels'
import type {
  EmpirePodApi,
  SubscriptionUpdatedPayload,
  SyncStatusPayload,
  AuthState,
  SyncStatePayload
} from '@shared/ipcChannels'

const api: EmpirePodApi = {
  search: {
    podcasts: (term) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_PODCASTS, term),
    preview: (feedUrl) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_PREVIEW, feedUrl)
  },
  recommendations: {
    categoryPicks: (category) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECOMMENDATIONS_CATEGORY_PICKS, category),
    keywordPicks: (term) => ipcRenderer.invoke(IPC_CHANNELS.RECOMMENDATIONS_KEYWORD_PICKS, term),
    dailyPick: () => ipcRenderer.invoke(IPC_CHANNELS.RECOMMENDATIONS_DAILY_PICK),
    trendingEpisodes: (category) =>
      ipcRenderer.invoke(IPC_CHANNELS.RECOMMENDATIONS_TRENDING_EPISODES, category)
  },
  subscriptions: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_LIST),
    subscribe: (feedUrl) => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_SUBSCRIBE, feedUrl),
    unsubscribe: (podcastId) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_UNSUBSCRIBE, podcastId),
    refresh: (podcastId) => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_REFRESH, podcastId),
    refreshAll: () => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_REFRESH_ALL),
    setArtwork: (podcastId, dataUrl) =>
      ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_SET_ARTWORK, podcastId, dataUrl),
    importOpml: () => ipcRenderer.invoke(IPC_CHANNELS.SUBSCRIPTIONS_IMPORT_OPML),
    onUpdated: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: SubscriptionUpdatedPayload): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.SUBSCRIPTIONS_UPDATED_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBSCRIPTIONS_UPDATED_EVENT, listener)
    },
    onSyncStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: SyncStatusPayload): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.SYNC_STATUS_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_STATUS_EVENT, listener)
    }
  },
  episodes: {
    list: (podcastId) => ipcRenderer.invoke(IPC_CHANNELS.EPISODES_LIST, podcastId),
    markPlayed: (episodeId, played) =>
      ipcRenderer.invoke(IPC_CHANNELS.EPISODES_MARK_PLAYED, episodeId, played),
    setDuration: (episodeId, durationSec) =>
      ipcRenderer.invoke(IPC_CHANNELS.EPISODES_SET_DURATION, episodeId, durationSec),
    getChapters: (chaptersUrl) =>
      ipcRenderer.invoke(IPC_CHANNELS.EPISODES_GET_CHAPTERS, chaptersUrl)
  },
  queue: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_GET),
    set: (episodeIds) => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_SET, episodeIds),
    getPrefs: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_PREFS_GET),
    setPrefs: (prefs) => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_PREFS_SET, prefs)
  },
  playback: {
    getPosition: (episodeId) => ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_GET_POSITION, episodeId),
    savePosition: (episodeId, positionSec) =>
      ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_SAVE_POSITION, episodeId, positionSec),
    getAllPositions: () => ipcRenderer.invoke(IPC_CHANNELS.PLAYBACK_GET_ALL_POSITIONS)
  },
  privateFeeds: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PRIVATE_FEEDS_LIST),
    add: (url, user, pass) => ipcRenderer.invoke(IPC_CHANNELS.PRIVATE_FEEDS_ADD, url, user, pass),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.PRIVATE_FEEDS_REMOVE, id),
    refresh: (id) => ipcRenderer.invoke(IPC_CHANNELS.PRIVATE_FEEDS_REFRESH, id)
  },
  podcastSettings: {
    get: (podcastId) => ipcRenderer.invoke(IPC_CHANNELS.PODCAST_SETTINGS_GET, podcastId),
    set: (podcastId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.PODCAST_SETTINGS_SET, podcastId, patch)
  },
  stations: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.STATIONS_LIST),
    create: (name) => ipcRenderer.invoke(IPC_CHANNELS.STATIONS_CREATE, name),
    delete: (stationId) => ipcRenderer.invoke(IPC_CHANNELS.STATIONS_DELETE, stationId),
    addPodcast: (stationId, podcastId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATIONS_ADD_PODCAST, stationId, podcastId),
    removePodcast: (stationId, podcastId) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATIONS_REMOVE_PODCAST, stationId, podcastId),
    updateSettings: (stationId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.STATIONS_UPDATE_SETTINGS, stationId, patch)
  },
  layout: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_GET),
    set: (layout) => ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_SET, layout)
  },
  update: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL)
  },
  auth: {
    signUpWithPassword: (email, password) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_UP_WITH_PASSWORD, email, password),
    signInWithPassword: (email, password) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_IN_WITH_PASSWORD, email, password),
    signOut: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_OUT),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATE),
    onStateChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, state: AuthState): void => callback(state)
      ipcRenderer.on(IPC_CHANNELS.AUTH_STATE_CHANGED_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTH_STATE_CHANGED_EVENT, listener)
    }
  },
  sync: {
    now: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_NOW),
    onState: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: SyncStatePayload): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.SYNC_STATE_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_STATE_EVENT, listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
