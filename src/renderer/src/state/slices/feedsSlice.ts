import type { StateCreator } from 'zustand'
import type { PrivateFeed } from '@renderer/types'
import type { AppState } from '../store'

export interface FeedsSlice {
  privateFeeds: PrivateFeed[]
  feedUrl: string
  feedUser: string
  feedPass: string
  showAddForm: boolean
  addFeedError: string | null
  addingFeed: boolean
  loadPrivateFeeds: () => Promise<void>
  toggleAddFeedForm: () => void
  setFeedField: (field: 'feedUrl' | 'feedUser' | 'feedPass', value: string) => void
  addFeed: () => Promise<void>
  removeFeed: (id: string) => Promise<void>
}

export const createFeedsSlice: StateCreator<AppState, [], [], FeedsSlice> = (set, get) => ({
  privateFeeds: [],
  feedUrl: '',
  feedUser: '',
  feedPass: '',
  showAddForm: false,
  addFeedError: null,
  addingFeed: false,

  loadPrivateFeeds: async () => {
    const feeds = await window.api.privateFeeds.list()
    set({ privateFeeds: feeds })
  },

  toggleAddFeedForm: () =>
    set((state) => ({
      showAddForm: !state.showAddForm,
      feedUrl: '',
      feedUser: '',
      feedPass: '',
      addFeedError: null
    })),

  setFeedField: (field, value) => set({ [field]: value } as Partial<AppState>),

  addFeed: async () => {
    const { feedUrl, feedUser, feedPass } = get()
    if (!feedUrl.trim()) return
    set({ addingFeed: true, addFeedError: null })
    try {
      await window.api.privateFeeds.add(feedUrl, feedUser, feedPass)
      await get().loadPrivateFeeds()
      await get().loadSubscriptions()
      set({ feedUrl: '', feedUser: '', feedPass: '', showAddForm: false, addingFeed: false })
    } catch (err) {
      set({
        addingFeed: false,
        addFeedError: err instanceof Error ? err.message : 'Failed to add feed'
      })
    }
  },

  removeFeed: async (id) => {
    await window.api.privateFeeds.remove(id)
    set((state) => ({ privateFeeds: state.privateFeeds.filter((f) => f.id !== id) }))
    await get().loadSubscriptions()
  }
})
