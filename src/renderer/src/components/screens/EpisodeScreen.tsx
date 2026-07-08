import { useEffect, useRef, useState } from 'react'
import { Play, Pause, ListPlus, Camera, Loader2, Check, ChevronRight } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import Pill from '@renderer/components/ui/Pill'
import { formatDurationLabel } from '@renderer/utils/duration'
import { resizeImageToDataUrl } from '@renderer/utils/imageResize'
import { computeProgress } from '@renderer/utils/progress'
import styles from './EpisodeScreen.module.css'

function EpisodeScreen(): React.JSX.Element {
  const selectedPodcastId = useAppStore((s) => s.selectedPodcastId)
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const loadEpisodesAction = useAppStore((s) => s.loadEpisodes)
  const unsubscribe = useAppStore((s) => s.unsubscribe)
  const setPodcastArtwork = useAppStore((s) => s.setPodcastArtwork)
  const goTo = useAppStore((s) => s.goTo)

  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const playing = useAppStore((s) => s.playing)
  const loadEpisode = useAppStore((s) => s.loadEpisode)
  const togglePlay = useAppStore((s) => s.togglePlay)
  const openSettings = useAppStore((s) => s.openSettings)
  const addToQueue = useAppStore((s) => s.addToQueue)
  const queue = useAppStore((s) => s.queue)
  const markEpisodePlayed = useAppStore((s) => s.markEpisodePlayed)
  const positions = useAppStore((s) => s.positions)
  const currentTimeSec = useAppStore((s) => s.currentTimeSec)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingArt, setUploadingArt] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (episodeId: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(episodeId)) next.delete(episodeId)
      else next.add(episodeId)
      return next
    })
  }

  const RECENT_EPISODE_LIMIT = 10

  const podcastId = selectedPodcastId ?? podcasts[0]?.id ?? null
  const podcast = podcastId ? podcasts.find((p) => p.id === podcastId) : undefined
  const allEpisodes = podcastId ? (episodesByPodcast[podcastId] ?? []) : []
  const episodes = allEpisodes.slice(0, RECENT_EPISODE_LIMIT)

  useEffect(() => {
    if (podcastId && !episodesByPodcast[podcastId]) {
      loadEpisodesAction(podcastId)
    }
  }, [podcastId, episodesByPodcast, loadEpisodesAction])

  if (!podcast) {
    return (
      <div className={styles.screen}>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          Subscribe to a podcast from Search to see its episodes here.
        </div>
      </div>
    )
  }

  const handlePlayToggle = (episodeId: string): void => {
    if (currentEpisodeId === episodeId) togglePlay()
    else loadEpisode(episodeId, { autoplay: true })
  }

  const handleUnsubscribe = async (): Promise<void> => {
    await unsubscribe(podcast.id)
    goTo('library')
  }

  const handleArtworkFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    setUploadingArt(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      await setPodcastArtwork(podcast.id, dataUrl)
    } catch (err) {
      console.error('Failed to update podcast artwork:', err)
    } finally {
      setUploadingArt(false)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <PodcastArtwork
            artworkUrl={podcast.customArtworkUrl ?? podcast.artworkUrl}
            fallbackLabel={podcast.name}
            size={88}
            radius={13}
            shadow="var(--shadow-now-playing-art)"
          />
          <div
            className={styles.artEditBtn}
            onClick={() => !uploadingArt && fileInputRef.current?.click()}
            title="Change artwork"
          >
            {uploadingArt ? (
              <Loader2 size={13} color="#fff" className="spin" />
            ) : (
              <Camera size={13} color="#fff" />
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleArtworkFile}
          />
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.name}>{podcast.name}</div>
          <div className={styles.sub}>
            {podcast.author} · {allEpisodes.length} episodes
            {allEpisodes.length > RECENT_EPISODE_LIMIT ? ` · showing ${RECENT_EPISODE_LIMIT} most recent` : ''}
          </div>
          <div className={styles.actions}>
            <Pill variant="secondary" onClick={handleUnsubscribe}>
              Subscribed
            </Pill>
            <Pill variant="secondary" onClick={() => openSettings(podcast.id)}>
              Settings
            </Pill>
          </div>
        </div>
      </div>

      <div className={styles.list}>
        {episodes.map((ep) => {
          const isPlaying = currentEpisodeId === ep.id && playing
          const inQueue = queue.includes(ep.id)
          const progress = computeProgress(ep, positions, currentEpisodeId, currentTimeSec)
          const isExpanded = expandedIds.has(ep.id)
          return (
            <div key={ep.id} className={styles.episodeGroup}>
              <div className={styles.row}>
                <div className={styles.playBtn} onClick={() => handlePlayToggle(ep.id)}>
                  {isPlaying ? (
                    <Pause size={13} fill="#fff" color="#fff" />
                  ) : (
                    <Play size={13} fill="#fff" color="#fff" style={{ marginLeft: 1 }} />
                  )}
                </div>
                <div className={styles.meta}>
                  <div className={styles.title} style={{ opacity: ep.played ? 0.42 : 1 }}>
                    {ep.title}
                  </div>
                  <div className={styles.subMeta}>
                    {new Date(ep.pubDateIso).toLocaleDateString()} · {formatDurationLabel(ep.durationSec)}
                  </div>
                  {progress !== undefined && progress > 0.02 && progress < 0.97 && (
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </div>
                <div
                  className={styles.iconBtn}
                  onClick={() => toggleExpanded(ep.id)}
                  title={isExpanded ? 'Collapse' : 'Show episode description'}
                >
                  <ChevronRight
                    size={15}
                    color="#6e6e73"
                    style={{
                      transform: isExpanded ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.12s ease'
                    }}
                  />
                </div>
                <div
                  className={styles.iconBtn}
                  onClick={() => markEpisodePlayed(ep.id, !ep.played)}
                  title={ep.played ? 'Mark as unplayed' : 'Mark as played'}
                >
                  <Check size={15} color={ep.played ? 'var(--color-accent)' : '#6e6e73'} strokeWidth={ep.played ? 3 : 2} />
                </div>
                <div
                  className={styles.iconBtn}
                  onClick={() => !inQueue && addToQueue(ep.id)}
                  title={inQueue ? 'Already in queue' : 'Add to queue'}
                >
                  <ListPlus size={15} color={inQueue ? '#c7c7cc' : '#6e6e73'} />
                </div>
              </div>
              {isExpanded && (
                <div className={styles.expandedDescription}>
                  {ep.description || 'No description available.'}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default EpisodeScreen
