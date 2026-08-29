import type { PersistedData } from '../persistence'

export interface BuiltRow {
  table: string
  row: Record<string, unknown>
}

function findPodcastIdForEpisode(snapshot: PersistedData, episodeId: string): string | null {
  for (const [podcastId, episodes] of Object.entries(snapshot.episodesByPodcast)) {
    if (episodes.some((e) => e.id === episodeId)) return podcastId
  }
  return null
}

function splitKey(key: string): [string, string] {
  const idx = key.indexOf(':')
  return idx === -1 ? [key, ''] : [key.slice(0, idx), key.slice(idx + 1)]
}

// Turns a sync ledger key (e.g. `playbackPosition:<episodeId>`) back into
// the Supabase row it represents, reading current values straight out of
// the snapshot — this is what lets a single generic hook in persistence.ts
// (see setSyncHooks) push any edit through the outbox without every one of
// the 15+ touchSync call sites needing to build its own row.
export function buildRowForKey(snapshot: PersistedData, userId: string, key: string): BuiltRow | null {
  const [kind, id] = splitKey(key)

  if (kind === 'podcast') {
    const podcast = snapshot.podcasts[id]
    if (!podcast) return null
    return {
      table: 'podcasts',
      row: {
        user_id: userId,
        id: podcast.id,
        feed_url: podcast.feedUrl,
        is_private: podcast.isPrivate,
        custom_artwork_url: podcast.customArtworkUrl,
        deleted_at: null
      }
    }
  }
  if (kind === 'podcastSettings') {
    const settings = snapshot.podcastSettings[id]
    if (!settings) return null
    return { table: 'podcast_settings', row: { user_id: userId, podcast_id: id, notify: settings.notify } }
  }
  if (kind === 'station') {
    const station = snapshot.stations[id]
    if (!station) return null
    return {
      table: 'stations',
      row: {
        user_id: userId,
        id: station.id,
        name: station.name,
        podcast_ids: station.podcastIds,
        sort_by: station.sortBy,
        episodes_per_show: station.episodesPerShow,
        deleted_at: null
      }
    }
  }
  if (kind === 'privateFeed') {
    const feed = snapshot.privateFeeds[id]
    if (!feed) return null
    return {
      table: 'private_feeds',
      row: { user_id: userId, id: feed.id, name: feed.name, url: feed.url, feed_user: feed.user, deleted_at: null }
    }
  }
  if (kind === 'episodePlayed') {
    const podcastId = findPodcastIdForEpisode(snapshot, id)
    const episode = podcastId ? snapshot.episodesByPodcast[podcastId]?.find((e) => e.id === id) : undefined
    if (!podcastId || !episode) return null
    return {
      table: 'episode_played',
      row: {
        user_id: userId,
        episode_id: id,
        podcast_id: podcastId,
        played: episode.played,
        duration_sec_override: episode.durationSec
      }
    }
  }
  if (kind === 'playbackPosition') {
    const positionSec = snapshot.playbackPositions[id]
    if (positionSec === undefined) return null
    return { table: 'playback_positions', row: { user_id: userId, episode_id: id, position_sec: positionSec } }
  }
  if (key === 'queue') {
    return { table: 'queue', row: { user_id: userId, episode_ids: snapshot.queue } }
  }
  if (key === 'queuePrefs') {
    if (!snapshot.queuePrefs) return null
    return {
      table: 'queue_prefs',
      row: {
        user_id: userId,
        sort_mode: snapshot.queuePrefs.sortMode,
        group_by_show: snapshot.queuePrefs.groupByShow,
        queue_view: snapshot.queuePrefs.queueView
      }
    }
  }
  return null
}
