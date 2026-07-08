import type { StateCreator } from 'zustand'
import type { PodcastSettings } from '@renderer/types'
import type { AppState } from '../store'

const DEFAULT_SETTINGS: PodcastSettings = {
  notify: false
}

export interface PodcastSettingsSlice {
  settingsByPodcast: Record<string, PodcastSettings>
  loadPodcastSettings: (podcastId: string) => Promise<void>
  setPodcastSetting: (podcastId: string, patch: Partial<PodcastSettings>) => Promise<void>
  getPodcastSettings: (podcastId: string) => PodcastSettings
}

export const createPodcastSettingsSlice: StateCreator<AppState, [], [], PodcastSettingsSlice> = (
  set,
  get
) => ({
  settingsByPodcast: {},

  loadPodcastSettings: async (podcastId) => {
    const settings = await window.api.podcastSettings.get(podcastId)
    set((state) => ({ settingsByPodcast: { ...state.settingsByPodcast, [podcastId]: settings } }))
  },

  setPodcastSetting: async (podcastId, patch) => {
    const updated = await window.api.podcastSettings.set(podcastId, patch)
    set((state) => ({ settingsByPodcast: { ...state.settingsByPodcast, [podcastId]: updated } }))
  },

  getPodcastSettings: (podcastId) => get().settingsByPodcast[podcastId] ?? DEFAULT_SETTINGS
})
