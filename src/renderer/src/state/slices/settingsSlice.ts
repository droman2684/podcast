import type { StateCreator } from 'zustand'
import type { AppState } from '../store'

export interface SettingsSlice {
  showSettings: boolean
  settingsPodcastId: string | null
  openSettings: (podcastId: string) => void
  closeSettings: () => void
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (set, get) => ({
  showSettings: false,
  settingsPodcastId: null,
  openSettings: (podcastId) => {
    set({ showSettings: true, settingsPodcastId: podcastId })
    get().loadPodcastSettings(podcastId)
  },
  closeSettings: () => set({ showSettings: false })
})
