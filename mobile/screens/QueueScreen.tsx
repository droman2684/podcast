import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  StyleSheet,
  type GestureResponderHandlers
} from 'react-native'
import { GripVertical, Play, Pause, Info, X, Download, Trash2 } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { groupByPodcast } from '@shared/queueView'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import DraggableList from '../components/DraggableList'
import { stripHtml } from '../lib/stripHtml'
import { colors, radii, cardShadow } from '../theme'

interface QueueItem {
  podcast: Podcast
  episode: Episode
}

interface Props {
  onPlay: (podcastId: string, episodeId: string, autoplay?: boolean) => void
}

const ROW_SLOT_HEIGHT = 84
const ROW_HEIGHT = 76

function formatRemaining(durationSec: number, positionSec: number): string {
  if (!durationSec) return ''
  const leftSec = Math.max(0, durationSec - positionSec)
  if (leftSec <= 0) return 'Played'
  const m = Math.round(leftSec / 60)
  return m > 0 ? `${m}m left` : '<1m left'
}

export default function QueueScreen({ onPlay }: Props): React.JSX.Element {
  const queue = useStore((s) => s.queue)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const reorderQueue = useStore((s) => s.reorderQueue)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const positions = useStore((s) => s.positions)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const togglePlay = useStore((s) => s.togglePlay)
  const downloadedUris = useStore((s) => s.downloadedUris)
  const downloadingIds = useStore((s) => s.downloadingIds)
  const downloadEpisode = useStore((s) => s.downloadEpisode)
  const removeDownload = useStore((s) => s.removeDownload)
  const grouped = useStore((s) => s.queueGroupedByShow)
  const setGrouped = useStore((s) => s.setQueueGroupedByShow)

  const [detailItem, setDetailItem] = useState<QueueItem | null>(null)
  // While a row is being dragged, the ScrollView's own scroll gesture has
  // to be disabled — its native scroll recognizer can otherwise steal a
  // vertical drag mid-gesture even though the grip's PanResponder claims
  // the touch first, which reads as "dragging just doesn't do anything."
  const [dragging, setDragging] = useState(false)
  const handleDragActiveChange = useCallback((active: boolean) => setDragging(active), [])

  const podcastById = useMemo(() => new Map(podcasts.map((p) => [p.id, p])), [podcasts])

  // O(1) lookup per queued episode rather than scanning every podcast's
  // episode list per queue entry — that nested-loop scan, redone on every
  // render, was part of why dragging in a large queue felt heavy.
  const items = useMemo(() => {
    const byEpisodeId = new Map<string, QueueItem>()
    for (const podcast of podcasts) {
      for (const episode of episodesByPodcast[podcast.id] ?? []) {
        byEpisodeId.set(episode.id, { podcast, episode })
      }
    }
    return queue.map((id) => byEpisodeId.get(id)).filter((item): item is QueueItem => item !== undefined)
  }, [queue, podcasts, episodesByPodcast])

  // Pressing play should always land you on the Player screen — pausing
  // (the one case where playback doesn't start) is the only exception.
  const handlePlayToggle = (podcastId: string, episodeId: string): void => {
    const willPlay = !(currentEpisodeId === episodeId && playing)
    if (currentEpisodeId === episodeId) togglePlay()
    else loadEpisode(episodeId, { autoplay: true })
    if (willPlay) onPlay(podcastId, episodeId)
  }

  const renderRow = (
    item: QueueItem,
    isActive: boolean,
    dragHandlers?: GestureResponderHandlers
  ): React.JSX.Element => {
    const isCurrent = currentEpisodeId === item.episode.id
    const downloaded = Boolean(downloadedUris[item.episode.id])
    const downloading = Boolean(downloadingIds[item.episode.id])
    // The currently-loaded episode's position lives in currentTimeSec
    // (updated live, many times a second) rather than the store's
    // positions map, which is only a periodic 5s snapshot — using it here
    // means the bar actually moves while an episode plays instead of
    // jumping every 5 seconds.
    const positionSec = isCurrent ? currentTimeSec : (positions[item.episode.id] ?? 0)
    const progress = item.episode.durationSec > 0 ? Math.min(1, positionSec / item.episode.durationSec) : 0
    return (
      <View style={[styles.row, isActive && styles.rowActive]}>
        {dragHandlers && (
          <View style={styles.gripHandle} hitSlop={12} accessibilityLabel="Drag to reorder" {...dragHandlers}>
            <GripVertical size={18} color={colors.textDisabled} />
          </View>
        )}
        <Pressable
          style={styles.rowMain}
          onPress={() => onPlay(item.podcast.id, item.episode.id, true)}
        >
          <Artwork
            url={item.episode.artworkUrl ?? item.podcast.artworkUrl}
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
                <Text style={styles.remaining}> · {formatRemaining(item.episode.durationSec, positionSec)}</Text>
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
          disabled={downloading}
          onPress={() => (downloaded ? removeDownload(item.episode.id) : downloadEpisode(item.episode))}
          accessibilityLabel={downloaded ? 'Remove download' : 'Download episode'}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : downloaded ? (
            <Trash2 size={17} color={colors.accent} />
          ) : (
            <Download size={17} color={colors.textMuted} />
          )}
        </Pressable>
        <Pressable hitSlop={10} onPress={() => setDetailItem(item)} accessibilityLabel="Episode details">
          <Info size={17} color={colors.textMuted} />
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
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Queue</Text>
        <Pressable
          style={[styles.groupToggle, grouped && styles.groupToggleActive]}
          onPress={() => setGrouped(!grouped)}
        >
          <Text style={[styles.groupToggleText, grouped && styles.groupToggleTextActive]}>
            Group by show
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>Queue is empty. Add episodes from Library or Discover.</Text>
      ) : grouped ? (
        <ScrollView contentContainerStyle={styles.listContent}>
          {groupByPodcast(items.map((i) => i.episode)).map((group) => {
            const podcast = podcastById.get(group.podcastId)
            if (!podcast) return null
            return (
              <View key={group.podcastId} style={styles.group}>
                <Text style={styles.groupHeader}>{podcast.name}</Text>
                {group.episodes.map((episode) => (
                  <SwipeToDelete
                    key={episode.id}
                    deleteLabel="Remove"
                    onDelete={() => removeFromQueue(episode.id)}
                  >
                    {renderRow({ podcast, episode }, false)}
                  </SwipeToDelete>
                ))}
              </View>
            )
          })}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent} scrollEnabled={!dragging}>
          <DraggableList
            data={items}
            keyExtractor={(item) => item.episode.id}
            itemHeight={ROW_SLOT_HEIGHT}
            onReorder={(reordered) => reorderQueue(reordered.map((r) => r.episode.id))}
            onActiveChange={handleDragActiveChange}
            renderItem={(item, isActive, dragHandlers) => (
              <SwipeToDelete deleteLabel="Remove" onDelete={() => removeFromQueue(item.episode.id)}>
                {renderRow(item, isActive, dragHandlers)}
              </SwipeToDelete>
            )}
          />
        </ScrollView>
      )}

      <Modal
        visible={detailItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailItem(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {detailItem && (
              <>
                <View style={styles.modalHeader}>
                  <Artwork
                    url={detailItem.episode.artworkUrl ?? detailItem.podcast.artworkUrl}
                    size={48}
                    radius={radii.artworkSm}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.epTitle} numberOfLines={2}>
                      {detailItem.episode.title}
                    </Text>
                    <Text style={styles.podcastName}>{detailItem.podcast.name}</Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => setDetailItem(null)} accessibilityLabel="Close">
                    <X size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
                <ScrollView style={styles.modalBody}>
                  <Text style={styles.modalDescription}>
                    {stripHtml(detailItem.episode.description) || 'No description available.'}
                  </Text>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  groupToggle: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: '#e8e8ed'
  },
  groupToggleActive: { backgroundColor: colors.accent },
  groupToggleText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  groupToggleTextActive: { color: '#fff' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  group: { marginBottom: 18 },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ROW_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    paddingHorizontal: 10,
    marginBottom: 8,
    ...cardShadow
  },
  rowActive: { opacity: 0.85 },
  gripHandle: { padding: 6, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end'
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.modal,
    borderTopRightRadius: radii.modal,
    maxHeight: '70%',
    padding: 20
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  modalBody: { marginTop: 4 },
  modalDescription: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, paddingBottom: 20 }
})
