export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Counts down as playback progresses, e.g. "-30:15" — the standard podcast-app
// convention for showing time left instead of the fixed total duration.
export function formatRemaining(currentSec: number, totalSec: number): string {
  return `-${formatSeconds(Math.max(0, totalSec - currentSec))}`
}

export function formatDurationLabel(totalSeconds: number): string {
  if (!totalSeconds) return ''
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.round((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m} min`
}
