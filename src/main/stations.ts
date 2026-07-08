import type { Station } from '@shared/types'
import type { StationSettingsPatch } from '@shared/ipcChannels'
import { getSnapshot, persist } from './persistence'
import { hashId } from './rss'

export function listStations(): Station[] {
  return Object.values(getSnapshot().stations)
}

export function createStation(name: string): Station {
  const snapshot = getSnapshot()
  const id = hashId(`${name}-${Date.now()}-${Math.random()}`)
  const station: Station = { id, name, podcastIds: [], sortBy: 'newest', episodesPerShow: 5 }
  snapshot.stations[id] = station
  persist()
  return station
}

export function deleteStation(stationId: string): void {
  delete getSnapshot().stations[stationId]
  persist()
}

export function addPodcastToStation(stationId: string, podcastId: string): Station {
  const snapshot = getSnapshot()
  const station = snapshot.stations[stationId]
  if (!station) throw new Error(`Station ${stationId} not found`)
  if (!station.podcastIds.includes(podcastId)) station.podcastIds.push(podcastId)
  persist()
  return station
}

export function removePodcastFromStation(stationId: string, podcastId: string): Station {
  const snapshot = getSnapshot()
  const station = snapshot.stations[stationId]
  if (!station) throw new Error(`Station ${stationId} not found`)
  station.podcastIds = station.podcastIds.filter((id) => id !== podcastId)
  persist()
  return station
}

export function updateStationSettings(stationId: string, patch: StationSettingsPatch): Station {
  const snapshot = getSnapshot()
  const station = snapshot.stations[stationId]
  if (!station) throw new Error(`Station ${stationId} not found`)
  Object.assign(station, patch)
  persist()
  return station
}
