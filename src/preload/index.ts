import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '@shared/ipcChannels'
import type { EmpirePodApi, SubscriptionUpdatedPayload } from '@shared/ipcChannels'

const api: EmpirePodApi = {
  search: {
    podcasts: (term) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_PODCASTS, term),
    preview: (feedUrl) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_PREVIEW, feedUrl)
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
    onUpdated: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: SubscriptionUpdatedPayload): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.SUBSCRIPTIONS_UPDATED_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBSCRIPTIONS_UPDATED_EVENT, listener)
    }
  },
  episodes: {
    list: (podcastId) => ipcRenderer.invoke(IPC_CHANNELS.EPISODES_LIST, podcastId),
    markPlayed: (episodeId, played) =>
      ipcRenderer.invoke(IPC_CHANNELS.EPISODES_MARK_PLAYED, episodeId, played),
    getChapters: (chaptersUrl) =>
      ipcRenderer.invoke(IPC_CHANNELS.EPISODES_GET_CHAPTERS, chaptersUrl)
  },
  queue: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_GET),
    set: (episodeIds) => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_SET, episodeIds)
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
