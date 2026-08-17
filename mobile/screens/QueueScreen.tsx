import { useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator, StyleSheet } from 'react-native'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Play,
  Pause,
  Info,
  X,
  Download,
  Trash2,
  Settings
} from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { groupByPodcast } from '@shared/queueView'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import SplitView from '../components/SplitView'
import { stripHtml } from '../lib/stripHtml'
import { colors, radii, cardShadow } from '../theme'
import type { LayoutMode } from '../lib/useLayout'

interface QueueItem {
  podcast: Podcast
  episode: Episode
}

interface Props {
  onPlay: (podcastId: string, episodeId: string, autoplay?: boolean) => void
  onBrowseLibrary: () => void
  onBrowseDiscover: () => void
  onOpenAppSettings: () => void
  /** Omit (or 'compact') for the phone layout — episode details open in a
   * bottom-sheet Modal. 'rail'/'regular' switch to SplitView instead, per
   * spec §7 "Queue... Detail pane replaces the bottom-sheet modal with
   * episode notes". */
  mode?: LayoutMode
}

const ROW_HEIGHT = 76

function formatRemaining(durationSec: number, positionSec: number): string {
  if (!durationSec) return ''
  const leftSec = Math.max(0, durationSec - positionSec)
  if (leftSec <= 0) return 'Played'
  const m = Math.round(leftSec / 60)
  return m > 0 ? `${m}m left` : '<1m left'
}

export default function QueueScreen({
  onPlay,
  onBrowseLibrary,
  onBrowseDiscover,
  onOpenAppSettings,
  mode = 'compact'
}: Props): React.JSX.Element {
  const isTablet = mode !== 'compact'
  const queue = useStore((s) => s.queue)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const reorderQueue = useStore((s) => s.reorderQueue)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const libraryLoading = useStore((s) => s.libraryLoading)
  const libraryLoaded = useStore((s) => s.libraryLoaded)
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

  // Replaced drag-to-reorder per request — a hand-rolled PanResponder drag
  // inside a ScrollView never felt reliable (grip hit target, scroll vs.
  // drag gesture conflicts). Arrow buttons are slower for a big jump but
  // every tap does exactly what it says, plus Move to Top/Bottom in the
  // detail modal for the big jumps arrows alone would be tedious for.
  const moveInQueue = (episodeId: string, targetIndex: number): void => {
    const currentIndex = queue.indexOf(episodeId)
    if (currentIndex === -1) return
    const clamped = Math.max(0, Math.min(queue.length - 1, targetIndex))
    if (clamped === currentIndex) return
    const next = [...queue]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(clamped, 0, moved)
    reorderQueue(next)
  }
  const moveUp = (episodeId: string): void => moveInQueue(episodeId, queue.indexOf(episodeId) - 1)
  const moveDown = (episodeId: string): void => moveInQueue(episodeId, queue.indexOf(episodeId) + 1)
  const moveToTop = (episodeId: string): void => moveInQueue(episodeId, 0)
  const moveToBottom = (episodeId: string): void => moveInQueue(episodeId, queue.length - 1)

  const renderRow = (item: QueueItem, position?: { index: number; total: number }): React.JSX.Element => {
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
    const selected = isTablet && detailItem?.episode.id === item.episode.id
    return (
      <View style={[styles.row, selected && styles.rowSelected]}>
        {position && (
          <View style={styles.moveControls}>
            <Pressable
              hitSlop={6}
              disabled={position.index === 0}
              onPress={() => moveUp(item.episode.id)}
              accessibilityLabel="Move up"
            >
              <ChevronUp size={18} color={position.index === 0 ? colors.textDisabled : colors.textMuted} />
            </Pressable>
            <Pressable
              hitSlop={6}
              disabled={position.index === position.total - 1}
              onPress={() => moveDown(item.episode.id)}
              accessibilityLabel="Move down"
            >
              <ChevronDown
                size={18}
                color={position.index === position.total - 1 ? colors.textDisabled : colors.textMuted}
              />
            </Pressable>
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

  const listBody =
    items.length === 0 ? (
      <EmptyQueueState
        libraryLoading={libraryLoading}
        libraryLoaded={libraryLoaded}
        hasSubscriptions={podcasts.length > 0}
        onBrowseLibrary={onBrowseLibrary}
        onBrowseDiscover={onBrowseDiscover}
      />
    ) : grouped ? (
      <ScrollView contentContainerStyle={styles.listContent}>
        {groupByPodcast(items.map((i) => i.episode)).map((group) => {
          const podcast = podcastById.get(group.podcastId)
          if (!podcast) return null
          return (
            <View key={group.podcastId} style={styles.group}>
              <Text style={styles.groupHeader}>{podcast.name}</Text>
              {group.episodes.map((episode) => (
                <SwipeToDelete key={episode.id} deleteLabel="Remove" onDelete={() => removeFromQueue(episode.id)}>
                  {renderRow({ podcast, episode })}
                </SwipeToDelete>
              ))}
            </View>
          )
        })}
      </ScrollView>
    ) : (
      <ScrollView contentContainerStyle={styles.listContent}>
        {items.map((item, index) => (
          <SwipeToDelete key={item.episode.id} deleteLabel="Remove" onDelete={() => removeFromQueue(item.episode.id)}>
            {renderRow(item, { index, total: items.length })}
          </SwipeToDelete>
        ))}
      </ScrollView>
    )

  // Shared between the phone's bottom-sheet Modal and the iPad detail pane
  // (spec §7) — same content either way, just different chrome around it.
  // `showClose` is false at `regular` width, where there's nothing to
  // return to but the empty-detail placeholder, same as EpisodeListScreen's
  // embedded detail pane never needing its own back link.
  const renderDetailContent = (item: QueueItem, showClose: boolean): React.JSX.Element => (
    <>
      <View style={styles.modalHeader}>
        <Artwork url={item.episode.artworkUrl ?? item.podcast.artworkUrl} size={48} radius={radii.artworkSm} />
        <View style={{ flex: 1 }}>
          <Text style={styles.epTitle} numberOfLines={2}>
            {item.episode.title}
          </Text>
          <Text style={styles.podcastName}>{item.podcast.name}</Text>
        </View>
        {showClose && (
          <Pressable hitSlop={10} onPress={() => setDetailItem(null)} accessibilityLabel="Close">
            <X size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <ScrollView style={styles.modalBody}>
        <Text style={styles.modalDescription}>
          {stripHtml(item.episode.description) || 'No description available.'}
        </Text>
      </ScrollView>
      {/* Move-to-top/bottom only makes sense for the plain manual order —
          grouped-by-show view is browse/remove only, same as arrows never
          showing there either. */}
      {!grouped && (
        <View style={styles.modalMoveRow}>
          <Pressable
            style={styles.modalMoveBtn}
            onPress={() => {
              moveToTop(item.episode.id)
              setDetailItem(null)
            }}
          >
            <ChevronsUp size={15} color={colors.accent} />
            <Text style={styles.modalMoveBtnText}>Move to Top</Text>
          </Pressable>
          <Pressable
            style={styles.modalMoveBtn}
            onPress={() => {
              moveToBottom(item.episode.id)
              setDetailItem(null)
            }}
          >
            <ChevronsDown size={15} color={colors.accent} />
            <Text style={styles.modalMoveBtnText}>Move to Bottom</Text>
          </Pressable>
        </View>
      )}
    </>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Queue</Text>
        <Pressable hitSlop={10} onPress={onOpenAppSettings} accessibilityLabel="Settings">
          <Settings size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.toolbar}>
        <Pressable
          style={[styles.groupToggle, grouped && styles.groupToggleActive]}
          onPress={() => setGrouped(!grouped)}
        >
          <Text style={[styles.groupToggleText, grouped && styles.groupToggleTextActive]}>
            Group by show
          </Text>
        </Pressable>
      </View>

      {isTablet ? (
        <SplitView
          mode={mode}
          hasSelection={detailItem !== null}
          onBack={() => setDetailItem(null)}
          backLabel="Queue"
          emptyDetailLabel="Select an episode to see its notes."
          list={listBody}
          detail={detailItem ? <View style={styles.detailPaneContent}>{renderDetailContent(detailItem, mode === 'regular')}</View> : null}
        />
      ) : (
        <>
          {listBody}
          <Modal
            visible={detailItem !== null}
            animationType="slide"
            transparent
            onRequestClose={() => setDetailItem(null)}
          >
            <Pressable style={styles.modalBackdrop} onPress={() => setDetailItem(null)}>
              <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
                {detailItem && renderDetailContent(detailItem, true)}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  )
}

interface EmptyQueueStateProps {
  libraryLoading: boolean
  libraryLoaded: boolean
  hasSubscriptions: boolean
  onBrowseLibrary: () => void
  onBrowseDiscover: () => void
}

// Queue is the app's landing tab, so this is the very first thing every new
// user sees — and it starts empty for everyone, since subscribing doesn't
// queue anything. A bare sentence with no way forward undersold that
// moment; this branches on what's actually true (still syncing vs. no
// subscriptions yet vs. subscribed-but-nothing-queued) and gives a real
// next step instead of "go figure it out yourself."
function EmptyQueueState({
  libraryLoading,
  libraryLoaded,
  hasSubscriptions,
  onBrowseLibrary,
  onBrowseDiscover
}: EmptyQueueStateProps): React.JSX.Element {
  if (libraryLoading && !libraryLoaded) {
    return (
      <View style={styles.emptyState}>
        <ActivityIndicator />
        <Text style={styles.emptyText}>Loading your library…</Text>
      </View>
    )
  }

  if (!hasSubscriptions) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>You haven't subscribed to any shows yet.</Text>
        <Pressable style={styles.emptyBtn} onPress={onBrowseDiscover}>
          <Text style={styles.emptyBtnText}>Browse Discover</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>Queue is empty — add episodes from a show to get started.</Text>
      <Pressable style={styles.emptyBtn} onPress={onBrowseLibrary}>
        <Text style={styles.emptyBtnText}>Browse Library</Text>
      </Pressable>
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
    marginBottom: 12
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  // iPad SplitView selection ring (spec §6) — see LibraryScreen's
  // gridCardSelected/listRowSelected for the same pattern.
  rowSelected: { borderWidth: 2, borderColor: colors.accent },
  moveControls: { alignItems: 'center', gap: 2 },
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
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 30, gap: 14 },
  emptyText: { textAlign: 'center', color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  emptyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
  modalBody: { flex: 1, marginTop: 4 },
  modalDescription: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, paddingBottom: 20 },
  modalMoveRow: { flexDirection: 'row', gap: 10, paddingBottom: 10 },
  modalMoveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.item,
    backgroundColor: colors.accentBg
  },
  modalMoveBtnText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  detailPaneContent: { flex: 1, padding: 24 }
})
