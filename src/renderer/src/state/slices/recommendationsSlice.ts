import type { StateCreator } from 'zustand'
import type { DiscoverPodcast, TrendingEpisode } from '@renderer/types'
import type { AppState } from '../store'

export interface RecPicksSource {
  type: 'category' | 'keyword'
  value: string
}

export interface RecommendationsSlice {
  activePicksSource: RecPicksSource | null
  categoryPicks: DiscoverPodcast[]
  categoryPicksLoading: boolean
  dailyPick: DiscoverPodcast | null
  dailyPickLoading: boolean
  trendingCategory: string | null
  trendingEpisodes: TrendingEpisode[]
  trendingEpisodesLoading: boolean
  loadDailyPick: () => Promise<void>
  pickRecCategory: (category: string) => Promise<void>
  pickRecKeyword: (term: string) => Promise<void>
  shuffleCategoryPicks: () => Promise<void>
  pickTrendingCategory: (category: string) => Promise<void>
}

export const createRecommendationsSlice: StateCreator<
  AppState,
  [],
  [],
  RecommendationsSlice
> = (set, get) => ({
  activePicksSource: null,
  categoryPicks: [],
  categoryPicksLoading: false,
  dailyPick: null,
  dailyPickLoading: false,
  trendingCategory: null,
  trendingEpisodes: [],
  trendingEpisodesLoading: false,

  loadDailyPick: async () => {
    set({ dailyPickLoading: true })
    try {
      const podcast = await window.api.recommendations.dailyPick()
      set({ dailyPick: podcast, dailyPickLoading: false })
    } catch {
      set({ dailyPickLoading: false })
    }
  },

  pickRecCategory: async (category) => {
    set({
      activePicksSource: { type: 'category', value: category },
      categoryPicksLoading: true,
      categoryPicks: []
    })
    try {
      const picks = await window.api.recommendations.categoryPicks(category)
      set({ categoryPicks: picks, categoryPicksLoading: false })
    } catch {
      set({ categoryPicksLoading: false })
    }
  },

  pickRecKeyword: async (term) => {
    const trimmed = term.trim()
    if (!trimmed) return
    set({
      activePicksSource: { type: 'keyword', value: trimmed },
      categoryPicksLoading: true,
      categoryPicks: []
    })
    try {
      const picks = await window.api.recommendations.keywordPicks(trimmed)
      set({ categoryPicks: picks, categoryPicksLoading: false })
    } catch {
      set({ categoryPicksLoading: false })
    }
  },

  shuffleCategoryPicks: async () => {
    const source = get().activePicksSource
    if (!source) return
    set({ categoryPicksLoading: true })
    try {
      const picks =
        source.type === 'category'
          ? await window.api.recommendations.categoryPicks(source.value)
          : await window.api.recommendations.keywordPicks(source.value)
      set({ categoryPicks: picks, categoryPicksLoading: false })
    } catch {
      set({ categoryPicksLoading: false })
    }
  },

  pickTrendingCategory: async (category) => {
    set({ trendingCategory: category, trendingEpisodesLoading: true, trendingEpisodes: [] })
    try {
      const episodes = await window.api.recommendations.trendingEpisodes(category)
      set({ trendingEpisodes: episodes, trendingEpisodesLoading: false })
    } catch {
      set({ trendingEpisodesLoading: false })
    }
  }
})
