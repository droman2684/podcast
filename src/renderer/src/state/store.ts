import { create } from 'zustand'
import { createNavSlice, type NavSlice } from './slices/navSlice'
import { createLayoutSlice, type LayoutSlice } from './slices/layoutSlice'
import { createPlaybackSlice, type PlaybackSlice } from './slices/playbackSlice'
import { createLibrarySlice, type LibrarySlice } from './slices/librarySlice'
import { createSearchSlice, type SearchSlice } from './slices/searchSlice'
import { createQueueSlice, type QueueSlice } from './slices/queueSlice'
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice'
import { createFeedsSlice, type FeedsSlice } from './slices/feedsSlice'
import { createSubscriptionsSlice, type SubscriptionsSlice } from './slices/subscriptionsSlice'
import {
  createPodcastSettingsSlice,
  type PodcastSettingsSlice
} from './slices/podcastSettingsSlice'
import { createStationsSlice, type StationsSlice } from './slices/stationsSlice'

export type AppState = NavSlice &
  LayoutSlice &
  PlaybackSlice &
  LibrarySlice &
  SearchSlice &
  QueueSlice &
  SettingsSlice &
  FeedsSlice &
  SubscriptionsSlice &
  PodcastSettingsSlice &
  StationsSlice

export const useAppStore = create<AppState>()((...a) => ({
  ...createNavSlice(...a),
  ...createLayoutSlice(...a),
  ...createPlaybackSlice(...a),
  ...createLibrarySlice(...a),
  ...createSearchSlice(...a),
  ...createQueueSlice(...a),
  ...createSettingsSlice(...a),
  ...createFeedsSlice(...a),
  ...createSubscriptionsSlice(...a),
  ...createPodcastSettingsSlice(...a),
  ...createStationsSlice(...a)
}))
