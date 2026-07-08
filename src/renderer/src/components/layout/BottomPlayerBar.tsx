import { Play, Pause, Volume2 } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import { formatSeconds, formatRemaining } from '@renderer/utils/duration'
import styles from './BottomPlayerBar.module.css'

function BottomPlayerBar(): React.JSX.Element {
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const playing = useAppStore((s) => s.playing)
  const currentTimeSec = useAppStore((s) => s.currentTimeSec)
  const durationSec = useAppStore((s) => s.durationSec)
  const togglePlay = useAppStore((s) => s.togglePlay)
  const volume = useAppStore((s) => s.volume)
  const setVolume = useAppStore((s) => s.setVolume)
  const seek = useAppStore((s) => s.seek)
  const openNowPlayingExpanded = useAppStore((s) => s.openNowPlayingExpanded)

  const podcastById = Object.fromEntries(podcasts.map((p) => [p.id, p]))
  const current = currentEpisodeId
    ? Object.values(episodesByPodcast)
        .flat()
        .find((e) => e.id === currentEpisodeId)
    : undefined
  const progressPct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (durationSec <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(durationSec, fraction * durationSec)))
  }

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    setVolume(Math.max(0, Math.min(1, fraction)))
  }

  return (
    <div className={styles.bar}>
      <div
        className={styles.left}
        onClick={() => current && openNowPlayingExpanded()}
        style={{ cursor: current ? 'pointer' : 'default' }}
        title={current ? 'Expand' : undefined}
      >
        {current && (
          <>
            <PodcastArtwork
              artworkUrl={podcastById[current.podcastId]?.customArtworkUrl ?? current.artworkUrl}
              fallbackLabel={podcastById[current.podcastId]?.name ?? current.title}
              size={36}
              radius={7}
            />
            <div className={styles.leftMeta}>
              <div className={styles.title}>{current.title}</div>
              <div className={styles.sub}>
                {podcastById[current.podcastId]?.name} · {formatSeconds(currentTimeSec)} /{' '}
                {formatRemaining(currentTimeSec, durationSec)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.center}>
        <div className={styles.playBtn} onClick={togglePlay}>
          {playing ? (
            <Pause size={13} fill="#fff" color="#fff" />
          ) : (
            <Play size={13} fill="#fff" color="#fff" style={{ marginLeft: 1 }} />
          )}
        </div>
        <div style={{ flex: 1, maxWidth: 480, cursor: 'pointer' }} onClick={handleSeekClick}>
          <div style={{ width: '100%', height: 2, background: '#f0f0f5', borderRadius: 2 }}>
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'var(--color-accent)',
                borderRadius: 2
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <Volume2 size={15} color="#6e6e73" />
        <div className={styles.volumeTrack} onClick={handleVolumeClick} style={{ cursor: 'pointer' }}>
          <div
            style={{ width: `${volume * 100}%`, height: '100%', background: '#6e6e73', borderRadius: 3 }}
          />
        </div>
      </div>
    </div>
  )
}

export default BottomPlayerBar
