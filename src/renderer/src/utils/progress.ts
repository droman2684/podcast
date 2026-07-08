export function computeProgress(
  episode: { id: string; durationSec: number },
  positions: Record<string, number>,
  currentEpisodeId: string | null,
  currentTimeSec: number
): number | undefined {
  if (episode.durationSec <= 0) return undefined
  // Deliberately not gated on episode.played — that flag can be set
  // manually (the "mark as played" checkmark) independent of how far you
  // actually got, so an episode marked played at 60% should still show 60%
  // progress. A naturally-finished episode still shows nothing, because
  // reaching the end resets its saved position to 0 (see useAudioEngine's
  // `ended` handler), which falls below the caller's near-zero threshold.
  const posSec = episode.id === currentEpisodeId ? currentTimeSec : (positions[episode.id] ?? 0)
  return posSec / episode.durationSec
}
