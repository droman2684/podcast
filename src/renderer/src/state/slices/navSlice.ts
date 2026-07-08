import type { StateCreator } from 'zustand'
import type { Nav } from '@renderer/types'
import type { AppState } from '../store'

export interface NavSlice {
  nav: Nav
  selectedPodcastId: string | null
  goTo: (nav: Nav, podcastId?: string) => void
}

export const createNavSlice: StateCreator<AppState, [], [], NavSlice> = (set, get) => ({
  nav: 'home',
  selectedPodcastId: null,
  goTo: (nav, podcastId) => {
    set((state) => ({
      nav,
      selectedPodcastId: podcastId !== undefined ? podcastId : state.selectedPodcastId
    }))
    // Navigating away should reveal the destination screen rather than leaving
    // it hidden behind the full-page player overlay.
    if (get().nowPlayingExpanded) get().closeNowPlayingExpanded()
  }
})
