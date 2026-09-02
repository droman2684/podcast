import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Play, Pause, Trash2, Settings, HardDriveDownload, ChevronUp, ChevronDown } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import { colors, radii, cardShadow } from '../theme'

interface DownloadItem {
  podcast: Podcast
  episode: Episode
}

function sortItems(items: DownloadItem[], downloadOrder: string[]): DownloadItem[] {
  const sorted = [...items]
  sorted.sort((a, b) => downloadOrder.indexOf(a.episode.id) - downloadOrder.indexOf(b.episode.id))
  return sorted
}

interface Props {
  onPlay: (podcastId: string, episodeId: string, autoplay?: boolean) => void
  onBrowseLibrary: () => void
  onOpenAppSettings: () => void
}

function formatRemaining(durationSec: number, positionSec: number): string {
  if (!durationSec) return ''
  const leftSec = Math.max(0, durationSec - positionSec)
  if (leftSec <= 0) return 'Played'
  const totalMin = Math.round(leftSec / 60)
  if (totalMin <= 0) return '<1m left'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

export default function DownloadsScreen({ onPlay, onBrowseLibrary, onOpenAppSettings }: Props): React.JSX.Element {
  const downloadedUris = useStore((s) => s.downloadedUris)
  const downloadOrder = useStore((s) => s.downloadOrder)
  const reorderDownloads = useStore((s) => s.reorderDownloads)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const positions = useStore((s) => s.positions)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const liveDuration = useStore((s) => s.duration)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const togglePlay = useStore((s) => s.togglePlay)
  const removeDownload = useStore((s) => s.removeDownload)

  // Downloaded episodes can outlive the podcast they came from being
  // rendered anywhere else (still on disk even if, say, a private feed's
  // credential goes missing) — matched up against episodesByPodcast/podcasts
  // here rather than trusted blindly, and silently skipped if either lookup
  // comes up empty rather than showing a broken row.
  const items = useMemo(() => {
    const out: DownloadItem[] = []
    for (const podcast of podcasts) {
      for (const episode of episodesByPodcast[podcast.id] ?? []) {
        if (downloadedUris[episode.id]) out.push({ podcast, episode })
      }
    }
    return sortItems(out, downloadOrder)
  }, [downloadedUris, podcasts, episodesByPodcast, downloadOrder])

  // Arrow buttons rather than drag-to-reorder — see QueueScreen's moveInQueue
  // for why (a hand-rolled drag inside a ScrollView never felt reliable).
  const moveInOrder = (episodeId: string, targetIndex: number): void => {
    const currentIndex = downloadOrder.indexOf(episodeId)
    if (currentIndex === -1) return
    const clamped = Math.max(0, Math.min(downloadOrder.length - 1, targetIndex))
    if (clamped === currentIndex) return
    const next = [...downloadOrder]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(clamped, 0, moved)
    reorderDownloads(next)
  }
  const moveUp = (episodeId: string): void => moveInOrder(episodeId, downloadOrder.indexOf(episodeId) - 1)
  const moveDown = (episodeId: string): void => moveInOrder(episodeId, downloadOrder.indexOf(episodeId) + 1)

  const handlePlayToggle = (podcastId: string, episodeId: string): void => {
    const willPlay = !(currentEpisodeId === episodeId && playing)
    if (currentEpisodeId === episodeId) togglePlay()
    else loadEpisode(episodeId, { autoplay: true })
    if (willPlay) onPlay(podcastId, episodeId)
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Downloads</Text>
        <Pressable hitSlop={10} onPress={onOpenAppSettings} accessibilityLabel="Settings">
          <Settings size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <HardDriveDownload size={32} color={colors.textDisabled} />
          <Text style={styles.emptyText}>
            Nothing downloaded yet — download an episode from a show to listen offline.
          </Text>
          <Pressable style={styles.emptyBtn} onPress={onBrowseLibrary}>
            <Text style={styles.emptyBtnText}>Browse Library</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {items.map((item, index) => {
            const isCurrent = currentEpisodeId === item.episode.id
            const positionSec = isCurrent ? currentTimeSec : (positions[item.episode.id] ?? 0)
            const durationSec = item.episode.durationSec > 0 ? item.episode.durationSec : isCurrent ? liveDuration : 0
            const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0
            return (
              <SwipeToDelete
                key={item.episode.id}
                deleteLabel="Remove"
                onDelete={() => removeDownload(item.episode.id)}
              >
                <View style={styles.row}>
                  <View style={styles.moveControls}>
                    <Pressable
                      hitSlop={6}
                      disabled={index === 0}
                      onPress={() => moveUp(item.episode.id)}
                      accessibilityLabel="Move up"
                    >
                      <ChevronUp size={18} color={index === 0 ? colors.textDisabled : colors.textMuted} />
                    </Pressable>
                    <Pressable
                      hitSlop={6}
                      disabled={index === items.length - 1}
                      onPress={() => moveDown(item.episode.id)}
                      accessibilityLabel="Move down"
                    >
                      <ChevronDown
                        size={18}
                        color={index === items.length - 1 ? colors.textDisabled : colors.textMuted}
                      />
                    </Pressable>
                  </View>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => onPlay(item.podcast.id, item.episode.id, true)}
                  >
                    <Artwork
                      url={item.podcast.customArtworkUrl ?? item.episode.artworkUrl ?? item.podcast.artworkUrl}
                      size={44}
                      radius={radii.artworkSm}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.epTitle} numberOfLines={1}>
                        {item.episode.title}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.podcastName} numberOfLines={1}>
                          {item.podcast.name}
                        </Text>
                        {positionSec > 0 && (
                          <Text style={styles.remaining}> · {formatRemaining(durationSec, positionSec)}</Text>
                        )}
                      </View>
                      {positionSec > 0 && (
                        <View style={styles.progressTrack}>
                          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                        </View>
                      )}
                    </View>
                  </Pressable>
                  <Pressable
                    hitSlop={10}
                    onPress={() => removeDownload(item.episode.id)}
                    accessibilityLabel="Remove download"
                  >
                    <Trash2 size={17} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    hitSlop={10}
                    onPress={() => handlePlayToggle(item.podcast.id, item.episode.id)}
                    accessibilityLabel={isCurrent && playing ? 'Pause' : 'Play'}
                  >
                    {isCurrent && playing ? (
                      <Pause size={18} color={colors.accent} fill={colors.accent} />
                    ) : (
                      <Play size={18} color={colors.accent} fill={colors.accent} />
                    )}
                  </Pressable>
                </View>
              </SwipeToDelete>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 76,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    ...cardShadow
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  moveControls: { alignItems: 'center', gap: 2 },
  epTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  podcastName: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  remaining: { fontSize: 11, color: colors.textMuted },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#e0e0e6',
    overflow: 'hidden',
    marginTop: 6
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30, gap: 14 },
  emptyText: { textAlign: 'center', color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  emptyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 }
})
