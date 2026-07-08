import { Play, Pause, ListPlus, X, Check } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import EpisodeArtwork from '@renderer/components/ui/EpisodeArtwork'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import Pill from '@renderer/components/ui/Pill'
import SectionLabel from '@renderer/components/ui/SectionLabel'
import { formatDurationLabel } from '@renderer/utils/duration'
import { computeProgress } from '@renderer/utils/progress'
import type { Episode } from '@renderer/types'
import styles from './HomeScreen.module.css'

function HomeScreen(): React.JSX.Element {
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const playing = useAppStore((s) => s.playing)
  const loadEpisode = useAppStore((s) => s.loadEpisode)
  const togglePlay = useAppStore((s) => s.togglePlay)
  const queue = useAppStore((s) => s.queue)
  const addToQueue = useAppStore((s) => s.addToQueue)
  const removeFromQueue = useAppStore((s) => s.removeFromQueue)
  const playFromQueue = useAppStore((s) => s.playFromQueue)
  const markEpisodePlayed = useAppStore((s) => s.markEpisodePlayed)
  const positions = useAppStore((s) => s.positions)
  const currentTimeSec = useAppStore((s) => s.currentTimeSec)

  const podcastById = Object.fromEntries(podcasts.map((p) => [p.id, p]))
  const allEpisodes = Object.values(episodesByPodcast).flat()
  const episodeById = Object.fromEntries(allEpisodes.map((e) => [e.id, e]))
  const HOME_QUEUE_LIMIT = 6
  const upNext = queue
    .map((id) => episodeById[id])
    .filter((e) => e !== undefined)
    .slice(0, HOME_QUEUE_LIMIT)
  const recent: Episode[] = Object.values(episodesByPodcast)
    .flat()
    .filter((e) => !e.played)
    .sort((a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1))
    .slice(0, 6)

  const handlePlayToggle = (episodeId: string): void => {
    if (currentEpisodeId === episodeId) togglePlay()
    else loadEpisode(episodeId, { autoplay: true })
  }

  if (podcasts.length === 0) {
    return (
      <div className={styles.screen}>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          Subscribe to a podcast from Search to see it here.
        </div>
      </div>
    )
  }

  const featured = recent[0]

  return (
    <div className={styles.screen}>
      {featured && (
        <div className={styles.banner}>
          <div className={styles.bannerCircleA} />
          <div className={styles.bannerCircleB} />
          <PodcastArtwork
            artworkUrl={featured.artworkUrl}
            fallbackLabel={podcastById[featured.podcastId]?.name ?? featured.title}
            size={96}
            radius={14}
          />
          <div className={styles.bannerText}>
            <div className={styles.bannerTitle}>{featured.title}</div>
            <div className={styles.bannerMeta}>
              {podcastById[featured.podcastId]?.name} · {formatDurationLabel(featured.durationSec)}
            </div>
            <div>
              <Pill onClick={() => handlePlayToggle(featured.id)}>
                {currentEpisodeId === featured.id && playing ? (
                  <>
                    <Pause size={12} fill="#fff" /> Pause
                  </>
                ) : (
                  <>
                    <Play size={12} fill="#fff" /> Play Now
                  </>
                )}
              </Pill>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className={styles.sectionHeader}>
          <SectionLabel>Queue</SectionLabel>
        </div>
        {upNext.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Your queue is empty — add episodes from a podcast&apos;s Episodes screen.
          </div>
        ) : (
          <div className={styles.episodeList}>
            {upNext.map((ep) => {
              const isPlaying = currentEpisodeId === ep.id && playing
              const progress = computeProgress(ep, positions, currentEpisodeId, currentTimeSec)
              return (
                <div
                  className={styles.episodeRow}
                  key={ep.id}
                  onClick={() => (currentEpisodeId === ep.id ? togglePlay() : playFromQueue(ep.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <EpisodeArtwork
                    artworkUrl={podcastById[ep.podcastId]?.customArtworkUrl ?? ep.artworkUrl}
                    fallbackLabel={podcastById[ep.podcastId]?.name ?? ep.title}
                    size={48}
                    radius={9}
                    progress={progress}
                  />
                  <div className={styles.episodeMeta}>
                    <div
                      className={styles.episodeTitle}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {ep.title}
                    </div>
                    <div className={styles.episodeSub}>
                      {podcastById[ep.podcastId]?.name} · {formatDurationLabel(ep.durationSec)}
                    </div>
                  </div>
                  <div
                    className={styles.queueBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      markEpisodePlayed(ep.id, !ep.played)
                    }}
                    title={ep.played ? 'Mark as unplayed' : 'Mark as played'}
                  >
                    <Check
                      size={14}
                      color={ep.played ? 'var(--color-accent)' : '#6e6e73'}
                      strokeWidth={ep.played ? 3 : 2}
                    />
                  </div>
                  <div
                    className={styles.queueBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromQueue(ep.id)
                    }}
                    title="Remove from queue"
                  >
                    <X size={14} color="#8e8e93" />
                  </div>
                  <div className={styles.playBtn}>
                    {isPlaying ? (
                      <Pause size={12} fill="var(--color-accent)" color="var(--color-accent)" />
                    ) : (
                      <Play size={12} fill="var(--color-accent)" color="var(--color-accent)" style={{ marginLeft: 1 }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div className={styles.sectionHeader}>
          <SectionLabel>New Episodes</SectionLabel>
        </div>
        <div className={styles.episodeList}>
          {recent.map((ep) => {
            const isPlaying = currentEpisodeId === ep.id && playing
            const inQueue = queue.includes(ep.id)
            const progress = computeProgress(ep, positions, currentEpisodeId, currentTimeSec)
            return (
              <div className={styles.episodeRow} key={ep.id}>
                <EpisodeArtwork
                  artworkUrl={podcastById[ep.podcastId]?.customArtworkUrl ?? ep.artworkUrl}
                  fallbackLabel={podcastById[ep.podcastId]?.name ?? ep.title}
                  size={48}
                  radius={9}
                  progress={progress}
                />
                <div className={styles.episodeMeta}>
                  <div className={styles.episodeTitle}>
                    <span className={styles.newDot} />
                    <span
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {ep.title}
                    </span>
                  </div>
                  <div className={styles.episodeSub}>
                    {podcastById[ep.podcastId]?.name} · {formatDurationLabel(ep.durationSec)}
                  </div>
                </div>
                <div
                  className={styles.queueBtn}
                  onClick={() => markEpisodePlayed(ep.id, true)}
                  title="Mark as played"
                >
                  <Check size={14} color="#6e6e73" />
                </div>
                <div
                  className={styles.queueBtn}
                  onClick={() => !inQueue && addToQueue(ep.id)}
                  title={inQueue ? 'Already in queue' : 'Add to queue'}
                >
                  <ListPlus size={14} color={inQueue ? '#c7c7cc' : '#6e6e73'} />
                </div>
                <div className={styles.playBtn} onClick={() => handlePlayToggle(ep.id)}>
                  {isPlaying ? (
                    <Pause size={12} fill="var(--color-accent)" color="var(--color-accent)" />
                  ) : (
                    <Play size={12} fill="var(--color-accent)" color="var(--color-accent)" style={{ marginLeft: 1 }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default HomeScreen
