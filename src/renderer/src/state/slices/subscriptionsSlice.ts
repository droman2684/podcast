import type { StateCreator } from 'zustand'
import type { Podcast, Episode } from '@renderer/types'
import type { OpmlImportResult } from '@shared/ipcChannels'
import type { AppState } from '../store'

function countUnplayed(episodes: Episode[]): number {
  return episodes.filter((e) => !e.played).length
}

export type SyncStatus = 'idle' | 'syncing'

export interface SubscriptionsSlice {
  podcasts: Podcast[]
  episodesByPodcast: Record<string, Episode[]>
  podcastsLoading: boolean
  syncStatus: SyncStatus
  lastSyncNewCount: number
  loadSubscriptions: () => Promise<void>
  loadEpisodes: (podcastId: string) => Promise<void>
  subscribe: (feedUrl: string) => Promise<Podcast>
  importOpml: () => Promise<OpmlImportResult | null>
  unsubscribe: (podcastId: string) => Promise<void>
  refreshPodcast: (podcastId: string) => Promise<void>
  markEpisodePlayed: (episodeId: string, played: boolean) => Promise<void>
  setEpisodeDuration: (episodeId: string, durationSec: number) => Promise<void>
  setPodcastArtwork: (podcastId: string, dataUrl: string | null) => Promise<void>
  initSubscriptionUpdates: () => void
}

// The main process refreshes feeds on a timer while the app is open (see
// main/index.ts). Without this listener those refreshes only ever land in
// the persisted file — the open renderer would never see new episodes until
// restart. Guarded module-level so React StrictMode's double-invoke (or any
// other re-mount) never registers the IPC listener twice.
let subscriptionUpdatesInitialized = false

export const createSubscriptionsSlice: StateCreator<AppState, [], [], SubscriptionsSlice> = (
  set,
  get
) => ({
  podcasts: [],
  episodesByPodcast: {},
  podcastsLoading: false,
  syncStatus: 'idle',
  lastSyncNewCount: 0,

  loadSubscriptions: async () => {
    set({ podcastsLoading: true })
    const podcasts = await window.api.subscriptions.list()
    set({ podcasts, podcastsLoading: false })
  },

  loadEpisodes: async (podcastId) => {
    const episodes = await window.api.episodes.list(podcastId)
    set((state) => ({
      episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: episodes }
    }))
  },

  subscribe: async (feedUrl) => {
    const podcast = await window.api.subscriptions.subscribe(feedUrl)
    set((state) => ({
      podcasts: state.podcasts.some((p) => p.id === podcast.id)
        ? state.podcasts.map((p) => (p.id === podcast.id ? podcast : p))
        : [...state.podcasts, podcast]
    }))
    await get().loadEpisodes(podcast.id)
    return podcast
  },

  importOpml: async () => {
    const result = await window.api.subscriptions.importOpml()
    if (!result) return null
    if (result.imported.length > 0) {
      set((state) => {
        const existingIds = new Set(state.podcasts.map((p) => p.id))
        const newOnes = result.imported.filter((p) => !existingIds.has(p.id))
        return { podcasts: [...state.podcasts, ...newOnes] }
      })
      await Promise.all(result.imported.map((p) => get().loadEpisodes(p.id)))
    }
    return result
  },

  unsubscribe: async (podcastId) => {
    await window.api.subscriptions.unsubscribe(podcastId)
    set((state) => ({
      podcasts: state.podcasts.filter((p) => p.id !== podcastId),
      episodesByPodcast: Object.fromEntries(
        Object.entries(state.episodesByPodcast).filter(([id]) => id !== podcastId)
      )
    }))
    // The main process also drops this podcast's episodes from the queue —
    // reload it locally so the renderer doesn't keep now-orphaned ids around
    // until the next full restart.
    await get().loadQueue()
  },

  refreshPodcast: async (podcastId) => {
    const { podcast, episodes } = await window.api.subscriptions.refresh(podcastId)
    set((state) => ({
      podcasts: state.podcasts.map((p) => (p.id === podcastId ? podcast : p)),
      episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: episodes }
    }))
  },

  markEpisodePlayed: async (episodeId, played) => {
    set((state) => {
      const next = { ...state.episodesByPodcast }
      let touchedPodcastId: string | null = null
      for (const podcastId of Object.keys(next)) {
        const idx = next[podcastId].findIndex((e) => e.id === episodeId)
        if (idx === -1) continue
        next[podcastId] = next[podcastId].map((e, i) => (i === idx ? { ...e, played } : e))
        touchedPodcastId = podcastId
        break
      }
      if (!touchedPodcastId) return { episodesByPodcast: next }
      // Keep the podcast's unread badge in sync with the episode list we just
      // mutated locally — otherwise it only updates after the next full reload.
      const podcasts = state.podcasts.map((p) =>
        p.id === touchedPodcastId ? { ...p, unread: countUnplayed(next[touchedPodcastId!]) } : p
      )
      return { episodesByPodcast: next, podcasts }
    })
    await window.api.episodes.markPlayed(episodeId, played)
  },

  setEpisodeDuration: async (episodeId, durationSec) => {
    set((state) => {
      const next = { ...state.episodesByPodcast }
      for (const podcastId of Object.keys(next)) {
        const idx = next[podcastId].findIndex((e) => e.id === episodeId)
        if (idx === -1) continue
        next[podcastId] = next[podcastId].map((e, i) => (i === idx ? { ...e, durationSec } : e))
        break
      }
      return { episodesByPodcast: next }
    })
    await window.api.episodes.setDuration(episodeId, durationSec)
  },

  setPodcastArtwork: async (podcastId, dataUrl) => {
    const podcast = await window.api.subscriptions.setArtwork(podcastId, dataUrl)
    set((state) => ({
      podcasts: state.podcasts.map((p) => (p.id === podcastId ? podcast : p))
    }))
  },

  initSubscriptionUpdates: () => {
    if (subscriptionUpdatesInitialized) return
    subscriptionUpdatesInitialized = true
    window.api.subscriptions.onUpdated(({ podcast, episodes }) => {
      set((state) => ({
        podcasts: state.podcasts.some((p) => p.id === podcast.id)
          ? state.podcasts.map((p) => (p.id === podcast.id ? podcast : p))
          : [...state.podcasts, podcast],
        episodesByPodcast: { ...state.episodesByPodcast, [podcast.id]: episodes }
      }))
    })
    window.api.subscriptions.onSyncStatus(({ status, newEpisodeCount }) => {
      set({ syncStatus: status, lastSyncNewCount: newEpisodeCount ?? 0 })
    })
  }
})
