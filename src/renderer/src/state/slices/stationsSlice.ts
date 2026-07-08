import type { StateCreator } from 'zustand'
import type { Station } from '@renderer/types'
import type { StationSettingsPatch } from '@shared/ipcChannels'
import type { AppState } from '../store'

export interface StationsSlice {
  stations: Station[]
  loadStations: () => Promise<void>
  createStation: (name: string) => Promise<void>
  deleteStation: (stationId: string) => Promise<void>
  addPodcastToStation: (stationId: string, podcastId: string) => Promise<void>
  removePodcastFromStation: (stationId: string, podcastId: string) => Promise<void>
  updateStationSettings: (stationId: string, patch: StationSettingsPatch) => Promise<void>
}

export const createStationsSlice: StateCreator<AppState, [], [], StationsSlice> = (set) => ({
  stations: [],

  loadStations: async () => {
    const stations = await window.api.stations.list()
    set({ stations })
  },

  createStation: async (name) => {
    const station = await window.api.stations.create(name)
    set((state) => ({ stations: [...state.stations, station] }))
  },

  deleteStation: async (stationId) => {
    await window.api.stations.delete(stationId)
    set((state) => ({ stations: state.stations.filter((s) => s.id !== stationId) }))
  },

  addPodcastToStation: async (stationId, podcastId) => {
    const updated = await window.api.stations.addPodcast(stationId, podcastId)
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
  },

  removePodcastFromStation: async (stationId, podcastId) => {
    const updated = await window.api.stations.removePodcast(stationId, podcastId)
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
  },

  updateStationSettings: async (stationId, patch) => {
    const updated = await window.api.stations.updateSettings(stationId, patch)
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
  }
})
