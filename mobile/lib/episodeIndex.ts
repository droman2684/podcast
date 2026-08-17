import type { Episode } from '@shared/types'

// A flat id -> episode lookup built once per episodesByPodcast change,
// rather than re-scanning every episode in every podcast on every call —
// AudioEngine in particular calls this on every playback status tick
// (several times a second while something's playing).
export function buildEpisodeIndex(episodesByPodcast: Record<string, Episode[]>): Map<string, Episode> {
  const index = new Map<string, Episode>()
  for (const episodes of Object.values(episodesByPodcast)) {
    for (const episode of episodes) index.set(episode.id, episode)
  }
  return index
}
