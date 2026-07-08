import { useEffect, useState } from 'react'
import { ChevronDown, Play, Pause, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import EpisodeArtwork from '@renderer/components/ui/EpisodeArtwork'
import { formatSeconds, formatRemaining } from '@renderer/utils/duration'
import { computeProgress } from '@renderer/utils/progress'
import { nextInQueue, previousInQueue } from '@shared/queueView'
import type { Chapter } from '@renderer/types'
import styles from './NowPlayingExpanded.module.css'

const SKIP_SECONDS = 30

function NowPlayingExpanded(): React.JSX.Element | null {
  const expanded = useAppStore((s) => s.nowPlayingExpanded)
  const close = useAppStore((s) => s.closeNowPlayingExpanded)
  const sidebarW = useAppStore((s) => s.sidebarW)
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
  const playFromQueue = useAppStore((s) => s.playFromQueue)
  const playNextInQueue = useAppStore((s) => s.playNextInQueue)
  const playPreviousInQueue = useAppStore((s) => s.playPreviousInQueue)
  const positions = useAppStore((s) => s.positions)

  const podcastById = Object.fromEntries(podcasts.map((p) => [p.id, p]))
  const allEpisodes = Object.values(episodesByPodcast).flat()
  const episodeById = Object.fromEntries(allEpisodes.map((e) => [e.id, e]))
  const current = currentEpisodeId ? episodeById[currentEpisodeId] : undefined
  const currentPodcast = current ? podcastById[current.podcastId] : undefined
  const upNext = queue.map((id) => episodeById[id]).filter((e) => e !== undefined)
  const canGoNext = nextInQueue(queue, currentEpisodeId) !== null
  const canGoPrevious = previousInQueue(queue, currentEpisodeId) !== null

  const [chapters, setChapters] = useState<Chapter[]>([])

  useEffect(() => {
    if (!current?.chaptersUrl) {
      setChapters([])
      return
    }
    let cancelled = false
    window.api.episodes.getChapters(current.chaptersUrl).then((result) => {
      if (!cancelled) setChapters(result)
    })
    return () => {
      cancelled = true
    }
  }, [current?.chaptersUrl])

  if (!expanded || !current) return null

  const progressPct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (durationSec <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    seek(Math.max(0, Math.min(durationSec, fraction * durationSec)))
  }

  return (
    <div className={styles.overlay} style={{ left: sidebarW }}>
      <div className={styles.topBar}>
        <div className={styles.minimizeBtn} onClick={close} title="Minimize">
          <ChevronDown size={16} color="#6e6e73" />
        </div>
        <span className={styles.topLabel}>Now Playing</span>
        <div style={{ width: 32 }} />
      </div>

      <div className={styles.scrollArea}>
        <div className={styles.content}>
          <div className={styles.artwork}>
            <PodcastArtwork
              artworkUrl={currentPodcast?.customArtworkUrl ?? current.artworkUrl}
              fallbackLabel={currentPodcast?.name ?? current.title}
              size="fill"
              radius={18}
              shadow="var(--shadow-now-playing-art)"
            />
          </div>

          <div className={styles.titleBlock}>
            <div className={styles.epTitle}>{current.title}</div>
            <div className={styles.podcastName}>{currentPodcast?.name}</div>
          </div>

          <div className={styles.progressBlock}>
            <div className={styles.progressTrack} onClick={handleSeekClick}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
              {durationSec > 0 &&
                chapters.map((chapter, i) => (
                  <div
                    key={i}
                    className={styles.chapterTick}
                    style={{ left: `${(chapter.startTime / durationSec) * 100}%` }}
                  />
                ))}
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
              <SkipBack size={20} />
            </span>
            <span
              className={styles.skipBtn}
              onClick={() => seek(Math.max(0, currentTimeSec - SKIP_SECONDS))}
              title="Back 30 seconds"
            >
              <RotateCcw size={22} />
            </span>
            <div className={styles.playCircle} onClick={togglePlay}>
              {playing ? (
                <Pause size={22} fill="#fff" color="#fff" />
              ) : (
                <Play size={22} fill="#fff" color="#fff" style={{ marginLeft: 3 }} />
              )}
            </div>
            <span
              className={styles.skipBtn}
              onClick={() => seek(Math.min(durationSec, currentTimeSec + SKIP_SECONDS))}
              title="Forward 30 seconds"
            >
              <RotateCw size={22} />
            </span>
            <span
              className={styles.skipBtn}
              onClick={() => canGoNext && playNextInQueue()}
              style={{ opacity: canGoNext ? 1 : 0.3, cursor: canGoNext ? 'pointer' : 'default' }}
              title="Next in queue"
            >
              <SkipForward size={20} />
            </span>
          </div>

          <div className={styles.speedPill} onClick={cycleSpeed}>
            {speed}x speed
          </div>

          {chapters.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Chapters</div>
              <div className={styles.chapterList}>
                {chapters.map((chapter, i) => (
                  <div
                    className={styles.chapterRow}
                    key={i}
                    onClick={() => seek(chapter.startTime)}
                  >
                    <span className={styles.chapterTime}>{formatSeconds(chapter.startTime)}</span>
                    <span className={styles.chapterTitle}>{chapter.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {upNext.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Up Next</div>
              <div className={styles.chapterList}>
                {upNext.map((episode) => (
                  <div
                    className={styles.queueRow}
                    key={episode.id}
                    onClick={() => playFromQueue(episode.id)}
                  >
                    <EpisodeArtwork
                      artworkUrl={podcastById[episode.podcastId]?.customArtworkUrl ?? episode.artworkUrl}
                      fallbackLabel={podcastById[episode.podcastId]?.name ?? episode.title}
                      size={40}
                      radius={8}
                      progress={computeProgress(episode, positions, currentEpisodeId, currentTimeSec)}
                    />
                    <div className={styles.queueMeta}>
                      <span className={styles.queueTitle}>{episode.title}</span>
                      <span className={styles.queueSub}>{podcastById[episode.podcastId]?.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {current.description && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>About this episode</div>
              <div className={styles.description}>{current.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default NowPlayingExpanded
