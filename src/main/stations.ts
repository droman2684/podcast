import type { Station } from '@shared/types'
import type { StationSettingsPatch } from '@shared/ipcChannels'
import { getSnapshot, persist, touchSync, touchSyncDelete } from './persistence'
import { hashId } from './rss'

export function listStations(): Station[] {
  return Object.values(getSnapshot().stations)
}

export function createStation(name: string): Station {
  const snapshot = getSnapshot()
  const id = hashId(`${name}-${Date.now()}-${Math.random()}`)
  const station: Station = { id, name, podcastIds: [], sortBy: 'newest', episodesPerShow: 5 }
  snapshot.stations[id] = station
  touchSync(`station:${id}`)
  persist()
  return station
}

export function deleteStation(stationId: string): void {
  delete getSnapshot().stations[stationId]
  touchSyncDelete('stations', stationId, `station:${stationId}`)
  persist()
}

export function addPodcastToStation(stationId: string, podcastId: string): Station {
  const snapshot = getSnapshot()
  const station = snapshot.stations[stationId]
  if (!station) throw new Error(`Station ${stationId} not found`)
  if (!station.podcastIds.includes(podcastId)) {
    station.podcastIds.push(podcastId)
    touchSync(`station:${stationId}`)
  }
  persist()
  return station
}

export function removePodcastFromStation(stationId: string, podcastId: string): Station {
  const snapshot = getSnapshot()
  const station = snapshot.stations[stationId]
  if (!station) throw new Error(`Station ${stationId} not found`)
  const nextPodcastIds = station.podcastIds.filter((id) => id !== podcastId)
  if (nextPodcastIds.length !== station.podcastIds.length) touchSync(`station:${stationId}`)
  station.podcastIds = nextPodcastIds
  persist()
  return station
}

export function updateStationSettings(stationId: string, patch: StationSettingsPatch): Station {
  const snapshot = getSnapshot()
  const station = snapshot.stations[stationId]
  if (!station) throw new Error(`Station ${stationId} not found`)
  Object.assign(station, patch)
  touchSync(`station:${stationId}`)
  persist()
  return station
}
