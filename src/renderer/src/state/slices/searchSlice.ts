import type { StateCreator } from 'zustand'
import type { DiscoverPodcast } from '@renderer/types'
import type { AppState } from '../store'

export interface SearchSlice {
  searchTerm: string
  discoverResults: DiscoverPodcast[]
  searching: boolean
  setSearchTerm: (term: string) => void
  search: (term: string) => Promise<void>
}

export const createSearchSlice: StateCreator<AppState, [], [], SearchSlice> = (set) => ({
  searchTerm: '',
  discoverResults: [],
  searching: false,
  setSearchTerm: (term) => set({ searchTerm: term }),
  search: async (term) => {
    const trimmed = term.trim()
    if (!trimmed) {
      set({ discoverResults: [] })
      return
    }
    set({ searching: true })
    try {
      const results = await window.api.search.podcasts(trimmed)
      set({ discoverResults: results })
    } finally {
      set({ searching: false })
    }
  }
})
