import { Play, Pause, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import ProgressBar from '@renderer/components/ui/ProgressBar'
import SectionLabel from '@renderer/components/ui/SectionLabel'
import { formatSeconds, formatRemaining } from '@renderer/utils/duration'
import { nextInQueue, previousInQueue } from '@shared/queueView'
import styles from './NowPlayingPanel.module.css'

const SKIP_SECONDS = 30

function NowPlayingPanel(): React.JSX.Element {
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const queue = useAppStore((s) => s.queue)
  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const playing = useAppStore((s) => s.playing)
  const currentTimeSec = useAppStore((s) => s.currentTimeSec)
  const durationSec = useAppStore((s) => s.durationSec)
  const speed = useAppStore((s) => s.speed)
  const togglePlay = useAppStore((s) => s.togglePlay)
  const cycleSpeed = useAppStore((s) => s.cycleSpeed)
  const seek = useAppStore((s) => s.seek)
  const playNextInQueue = useAppStore((s) => s.playNextInQueue)
  const playPreviousInQueue = useAppStore((s) => s.playPreviousInQueue)

  const podcastById = Object.fromEntries(podcasts.map((p) => [p.id, p]))
  const allEpisodes = Object.values(episodesByPodcast).flat()
  const episodeById = Object.fromEntries(allEpisodes.map((e) => [e.id, e]))

  const current = currentEpisodeId ? episodeById[currentEpisodeId] : undefined
  const currentPodcast = current ? podcastById[current.podcastId] : undefined
  const canGoNext = nextInQueue(queue, currentEpisodeId) !== null
  const canGoPrevious = previousInQueue(queue, currentEpisodeId) !== null

  const progressPct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (durationSec <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(durationSec, fraction * durationSec)))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.upper}>
        <SectionLabel>Now Playing</SectionLabel>

        {current ? (
          <div className={styles.upperInner}>
            <div className={styles.artWrap}>
              <PodcastArtwork
                artworkUrl={currentPodcast?.customArtworkUrl ?? current.artworkUrl}
                fallbackLabel={currentPodcast?.name ?? current.title}
                size="fill"
                radius={13}
                shadow="var(--shadow-now-playing-art)"
              />
            </div>
            <div>
              <div className={styles.title}>{current.title}</div>
              <div className={styles.sub}>{currentPodcast?.name}</div>
            </div>

            <div className={styles.progressRow}>
              <div onClick={handleSeekClick} style={{ cursor: 'pointer' }}>
                <ProgressBar pct={progressPct} />
              </div>
              <div className={styles.times}>
                <span>{formatSeconds(currentTimeSec)}</span>
                <span>{formatRemaining(currentTimeSec, durationSec)}</span>
              </div>
            </div>

            <div className={styles.controls}>
              <span
                className={styles.skipBtn}
                onClick={() => canGoPrevious && playPreviousInQueue()}
                style={{ opacity: canGoPrevious ? 1 : 0.3, cursor: canGoPrevious ? 'pointer' : 'default' }}
                title="Previous in queue"
              >
                <SkipBack size={18} />
              </span>
              <span
                className={styles.skipBtn}
                onClick={() => seek(Math.max(0, currentTimeSec - SKIP_SECONDS))}
                title="Back 30 seconds"
              >
                <RotateCcw size={18} />
              </span>
              <div className={styles.playCircle} onClick={togglePlay}>
                {playing ? (
                  <Pause size={18} fill="#fff" color="#fff" />
                ) : (
                  <Play size={18} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
                )}
              </div>
              <span
                className={styles.skipBtn}
                onClick={() => seek(Math.min(durationSec, currentTimeSec + SKIP_SECONDS))}
                title="Forward 30 seconds"
              >
                <RotateCw size={18} />
              </span>
              <span
                className={styles.skipBtn}
                onClick={() => canGoNext && playNextInQueue()}
                style={{ opacity: canGoNext ? 1 : 0.3, cursor: canGoNext ? 'pointer' : 'default' }}
                title="Next in queue"
              >
                <SkipForward size={18} />
              </span>
            </div>

            <div className={styles.pillRow}>
              <span className={styles.smallPill} onClick={cycleSpeed}>
                {speed}x
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.sub}>Nothing playing</div>
        )}
      </div>

      {current && (
        <div className={styles.lower}>
          <SectionLabel>About this episode</SectionLabel>
          <div className={styles.description}>
            {current.description || 'No description available.'}
          </div>
        </div>
      )}
    </div>
  )
}

export default NowPlayingPanel
