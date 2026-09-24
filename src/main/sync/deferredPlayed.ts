import type { Episode } from '@shared/types'
import { getSnapshot, persist } from '../persistence'

// A pulled episode_played row can name an episode this device hasn't
// fetched yet — the startup pull runs before the first feed refresh, so a
// newer episode another device already finished is routinely missing here.
// The shared engine marks every pulled row as seen whether or not it could
// be applied, so a row dropped at that point is never offered again and the
// episode would stay unplayed on this device forever. Instead it's parked
// here (persisted, so it survives a restart before the refresh lands) and
// applied as soon as the episode shows up in a subscribe/refresh.
const STORAGE_KEY = 'sync.deferredPlayed.v1'

interface DeferredPlayed {
  podcastId: string
  played: boolean
  durationSecOverride: number | null
}

function load(): Record<string, DeferredPlayed> {
  try {
    const raw = getSnapshot().syncKV[STORAGE_KEY]
    return raw ? (JSON.parse(raw) as Record<string, DeferredPlayed>) : {}
  } catch {
    return {}
  }
}

function save(map: Record<string, DeferredPlayed>): void {
  const snapshot = getSnapshot()
  if (Object.keys(map).length > 0) snapshot.syncKV[STORAGE_KEY] = JSON.stringify(map)
  else delete snapshot.syncKV[STORAGE_KEY]
  persist()
}

export function deferPlayed(episodeId: string, entry: DeferredPlayed): void {
  const map = load()
  map[episodeId] = entry
  save(map)
}

// Returns `episodes` with any parked played/duration values applied, and
// drops the ones it used. Callers recompute unread counts afterwards.
export function applyDeferredPlayed(episodes: Episode[]): Episode[] {
  const map = load()
  if (Object.keys(map).length === 0) return episodes
  let changed = false
  const out = episodes.map((e) => {
    const d = map[e.id]
    if (!d) return e
    delete map[e.id]
    changed = true
    return { ...e, played: d.played, durationSec: d.durationSecOverride ?? e.durationSec }
  })
  if (changed) save(map)
  return out
}
