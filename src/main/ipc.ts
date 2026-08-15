import { ipcMain, dialog } from 'electron'
import { IPC_CHANNELS } from '@shared/ipcChannels'
import type { StationSettingsPatch, ColumnLayout } from '@shared/ipcChannels'
import type { QueuePrefs } from '@shared/queueView'
import type { PodcastSettings } from '@shared/types'
import { getSnapshot, persist, touchSync, DEFAULT_PODCAST_SETTINGS } from './persistence'
import { searchPodcasts, previewPodcast } from './search'
import { getCategoryPicks, getKeywordPicks, getPodcastOfTheDay } from './recommendations'
import { getTrendingEpisodes } from './trendingEpisodes'
import {
  listPodcasts,
  listEpisodes,
  subscribe,
  unsubscribe,
  refreshPodcast,
  refreshAllPodcasts,
  markEpisodePlayed,
  setEpisodeDuration,
  setPodcastArtwork,
  importOpml
} from './subscriptions'
import { listPrivateFeeds, addPrivateFeed, removePrivateFeed, refreshPrivateFeed } from './privateFeeds'
import { fetchChapters } from './chapters'
import {
  listStations,
  createStation,
  deleteStation,
  addPodcastToStation,
  removePodcastFromStation,
  updateStationSettings
} from './stations'
import { checkForUpdate, installUpdate } from './updater'
import { getMainWindow } from './windowRegistry'
import { signUpWithPassword, signInWithPassword, signOut, getAuthState } from './sync/auth'
import { runSyncCycle } from './sync/sync'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_PODCASTS, (_event, term: string) => searchPodcasts(term))
  ipcMain.handle(IPC_CHANNELS.SEARCH_PREVIEW, (_event, feedUrl: string) => previewPodcast(feedUrl))

  ipcMain.handle(IPC_CHANNELS.RECOMMENDATIONS_CATEGORY_PICKS, (_event, category: string) =>
    getCategoryPicks(category)
  )
  ipcMain.handle(IPC_CHANNELS.RECOMMENDATIONS_KEYWORD_PICKS, (_event, term: string) =>
    getKeywordPicks(term)
  )
  ipcMain.handle(IPC_CHANNELS.RECOMMENDATIONS_DAILY_PICK, () => getPodcastOfTheDay())
  ipcMain.handle(IPC_CHANNELS.RECOMMENDATIONS_TRENDING_EPISODES, (_event, category: string) =>
    getTrendingEpisodes(category)
  )

  ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_LIST, () => listPodcasts())
  ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_SUBSCRIBE, (_event, feedUrl: string) =>
    subscribe(feedUrl)
  )
  ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_UNSUBSCRIBE, (_event, podcastId: string) =>
    unsubscribe(podcastId)
  )
  ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_REFRESH, async (_event, podcastId: string) => {
    const { podcast, episodes, newEpisodeIds } = await refreshPodcast(podcastId)
    return { podcast, episodes, newEpisodeCount: newEpisodeIds.length }
  })
  ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_REFRESH_ALL, async () => {
    const results = await refreshAllPodcasts()
    return { results }
  })
  ipcMain.handle(
    IPC_CHANNELS.SUBSCRIPTIONS_SET_ARTWORK,
    (_event, podcastId: string, dataUrl: string | null) => setPodcastArtwork(podcastId, dataUrl)
  )
  ipcMain.handle(IPC_CHANNELS.SUBSCRIPTIONS_IMPORT_OPML, async () => {
    const win = getMainWindow()
    const dialogResult = await (win
      ? dialog.showOpenDialog(win, {
          title: 'Import OPML Subscriptions',
          filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
          properties: ['openFile']
        })
      : dialog.showOpenDialog({
          title: 'Import OPML Subscriptions',
          filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
          properties: ['openFile']
        }))
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) return null
    return importOpml(dialogResult.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.EPISODES_LIST, (_event, podcastId: string) => listEpisodes(podcastId))
  ipcMain.handle(
    IPC_CHANNELS.EPISODES_MARK_PLAYED,
    (_event, episodeId: string, played: boolean) => markEpisodePlayed(episodeId, played)
  )
  ipcMain.handle(
    IPC_CHANNELS.EPISODES_SET_DURATION,
    (_event, episodeId: string, durationSec: number) => setEpisodeDuration(episodeId, durationSec)
  )
  ipcMain.handle(IPC_CHANNELS.EPISODES_GET_CHAPTERS, (_event, chaptersUrl: string) =>
    fetchChapters(chaptersUrl)
  )

  ipcMain.handle(IPC_CHANNELS.QUEUE_GET, () => getSnapshot().queue)
  ipcMain.handle(IPC_CHANNELS.QUEUE_SET, (_event, episodeIds: string[]) => {
    getSnapshot().queue = episodeIds
    touchSync('queue')
    persist()
  })

  ipcMain.handle(IPC_CHANNELS.QUEUE_PREFS_GET, () => getSnapshot().queuePrefs)
  ipcMain.handle(IPC_CHANNELS.QUEUE_PREFS_SET, (_event, prefs: QueuePrefs) => {
    getSnapshot().queuePrefs = prefs
    touchSync('queuePrefs')
    persist()
  })

  ipcMain.handle(IPC_CHANNELS.PLAYBACK_GET_POSITION, (_event, episodeId: string) => {
    return getSnapshot().playbackPositions[episodeId] ?? 0
  })
  ipcMain.handle(
    IPC_CHANNELS.PLAYBACK_SAVE_POSITION,
    (_event, episodeId: string, positionSec: number) => {
      getSnapshot().playbackPositions[episodeId] = positionSec
      touchSync(`playbackPosition:${episodeId}`)
      persist()
    }
  )
  ipcMain.handle(IPC_CHANNELS.PLAYBACK_GET_ALL_POSITIONS, () => getSnapshot().playbackPositions)

  ipcMain.handle(IPC_CHANNELS.PRIVATE_FEEDS_LIST, () => listPrivateFeeds())
  ipcMain.handle(
    IPC_CHANNELS.PRIVATE_FEEDS_ADD,
    (_event, url: string, user: string, pass: string) => addPrivateFeed(url, user, pass)
  )
  ipcMain.handle(IPC_CHANNELS.PRIVATE_FEEDS_REMOVE, (_event, id: string) => removePrivateFeed(id))
  ipcMain.handle(IPC_CHANNELS.PRIVATE_FEEDS_REFRESH, (_event, id: string) => refreshPrivateFeed(id))

  ipcMain.handle(IPC_CHANNELS.PODCAST_SETTINGS_GET, (_event, podcastId: string) => {
    return getSnapshot().podcastSettings[podcastId] ?? DEFAULT_PODCAST_SETTINGS
  })
  ipcMain.handle(
    IPC_CHANNELS.PODCAST_SETTINGS_SET,
    (_event, podcastId: string, patch: Partial<PodcastSettings>) => {
      const snapshot = getSnapshot()
      const current = snapshot.podcastSettings[podcastId] ?? DEFAULT_PODCAST_SETTINGS
      const updated = { ...current, ...patch }
      snapshot.podcastSettings[podcastId] = updated
      touchSync(`podcastSettings:${podcastId}`)
      persist()
      return updated
    }
  )

  ipcMain.handle(IPC_CHANNELS.STATIONS_LIST, () => listStations())
  ipcMain.handle(IPC_CHANNELS.STATIONS_CREATE, (_event, name: string) => createStation(name))
  ipcMain.handle(IPC_CHANNELS.STATIONS_DELETE, (_event, stationId: string) => deleteStation(stationId))
  ipcMain.handle(
    IPC_CHANNELS.STATIONS_ADD_PODCAST,
    (_event, stationId: string, podcastId: string) => addPodcastToStation(stationId, podcastId)
  )
  ipcMain.handle(
    IPC_CHANNELS.STATIONS_REMOVE_PODCAST,
    (_event, stationId: string, podcastId: string) => removePodcastFromStation(stationId, podcastId)
  )
  ipcMain.handle(
    IPC_CHANNELS.STATIONS_UPDATE_SETTINGS,
    (_event, stationId: string, patch: StationSettingsPatch) =>
      updateStationSettings(stationId, patch)
  )

  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET, () => getSnapshot().columnLayout)
  ipcMain.handle(IPC_CHANNELS.LAYOUT_SET, (_event, layout: ColumnLayout) => {
    getSnapshot().columnLayout = layout
    persist()
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, () => checkForUpdate())
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => installUpdate())

  ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_UP_WITH_PASSWORD, (_event, email: string, password: string) =>
    signUpWithPassword(email, password)
  )
  ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_IN_WITH_PASSWORD, (_event, email: string, password: string) =>
    signInWithPassword(email, password)
  )
  ipcMain.handle(IPC_CHANNELS.AUTH_SIGN_OUT, () => signOut())
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATE, () => getAuthState())

  ipcMain.handle(IPC_CHANNELS.SYNC_NOW, () => runSyncCycle())
}
