import { X } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import ToggleSwitch from '@renderer/components/ui/ToggleSwitch'
import styles from './PodcastSettingsModal.module.css'

function PodcastSettingsModal(): React.JSX.Element | null {
  const showSettings = useAppStore((s) => s.showSettings)
  const settingsPodcastId = useAppStore((s) => s.settingsPodcastId)
  const closeSettings = useAppStore((s) => s.closeSettings)
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const getPodcastSettings = useAppStore((s) => s.getPodcastSettings)
  const setPodcastSetting = useAppStore((s) => s.setPodcastSetting)
  const markEpisodePlayed = useAppStore((s) => s.markEpisodePlayed)
  const unsubscribe = useAppStore((s) => s.unsubscribe)
  const goTo = useAppStore((s) => s.goTo)

  if (!showSettings || !settingsPodcastId) return null

  const podcast = podcasts.find((p) => p.id === settingsPodcastId)
  if (!podcast) return null

  const episodes = episodesByPodcast[podcast.id] ?? []
  const settings = getPodcastSettings(podcast.id)

  const handleMarkAllPlayed = (): void => {
    episodes.filter((e) => !e.played).forEach((e) => markEpisodePlayed(e.id, true))
  }

  const handleUnsubscribe = async (): Promise<void> => {
    closeSettings()
    await unsubscribe(podcast.id)
    goTo('library')
  }

  return (
    <div className={styles.backdrop} onClick={closeSettings}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <PodcastArtwork
            artworkUrl={podcast.customArtworkUrl ?? podcast.artworkUrl}
            fallbackLabel={podcast.name}
            size={44}
            radius={10}
          />
          <div className={styles.headerMeta}>
            <div className={styles.podcastName}>{podcast.name}</div>
            <div className={styles.modalLabel}>Podcast Settings</div>
          </div>
          <div className={styles.closeBtn} onClick={closeSettings}>
            <X size={14} color="#6e6e73" />
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Notifications</div>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>Notify on new episodes</span>
            <ToggleSwitch
              on={settings.notify}
              onToggle={() => setPodcastSetting(podcast.id, { notify: !settings.notify })}
            />
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Management</div>
          <div className={styles.actionRow} onClick={handleMarkAllPlayed}>
            Mark all episodes as played
          </div>
          <div className={`${styles.actionRow} ${styles.dangerRow}`} onClick={handleUnsubscribe}>
            Unsubscribe from {podcast.name}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PodcastSettingsModal
