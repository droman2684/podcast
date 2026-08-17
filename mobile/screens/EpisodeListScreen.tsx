import { useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { Settings, ChevronDown, ChevronUp, Download, Trash2, ListPlus, Check, RotateCcw } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { stripHtml } from '../lib/stripHtml'
import { colors, radii, cardShadow } from '../theme'

function formatDuration(sec: number): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

interface RowProps {
  episode: Episode
  podcast: Podcast
  position: number
  queued: boolean
  downloaded: boolean
  downloading: boolean
  onPlay: () => void
  onToggleQueue: () => void
  onTogglePlayed: () => void
  onToggleDownload: () => void
}

function EpisodeRow({
  episode,
  podcast,
  position,
  queued,
  downloaded,
  downloading,
  onPlay,
  onToggleQueue,
  onTogglePlayed,
  onToggleDownload
}: RowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const description = stripHtml(episode.description)

  return (
    <View style={styles.card}>
      <Pressable style={styles.row} onPress={onPlay}>
        <Artwork url={episode.artworkUrl ?? podcast.artworkUrl} size={44} radius={radii.artworkSm} />
        <View style={{ flex: 1 }}>
          <Text style={styles.epTitle} numberOfLines={2}>
            {episode.title}
          </Text>
          <Text style={styles.epMeta}>
            {new Date(episode.pubDateIso).toLocaleDateString()} · {formatDuration(episode.durationSec)}
            {episode.played ? ' · Played' : position > 0 ? ` · ${formatDuration(position)} in` : ''}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={onToggleQueue}
          accessibilityLabel={queued ? 'Remove from queue' : 'Add to queue'}
        >
          {queued ? (
            <Check size={16} color={colors.accent} strokeWidth={3} />
          ) : (
            <ListPlus size={16} color={colors.textMuted} />
          )}
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={onTogglePlayed}
          accessibilityLabel={episode.played ? 'Mark as unplayed' : 'Mark as played'}
        >
          {episode.played ? (
            <RotateCcw size={16} color={colors.textMuted} />
          ) : (
            <Check size={16} color={colors.textMuted} />
          )}
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={onToggleDownload}
          disabled={downloading}
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
      </Pressable>
      {description.length > 0 && (
        <Pressable style={styles.descToggle} onPress={() => setExpanded(!expanded)}>
          <Text style={styles.descToggleText} numberOfLines={expanded ? undefined : 2}>
            {description}
          </Text>
          {expanded ? (
            <ChevronUp size={14} color={colors.textMuted} />
          ) : (
            <ChevronDown size={14} color={colors.textMuted} />
          )}
        </Pressable>
      )}
    </View>
  )
}

interface Props {
  podcast: Podcast
  onBack: () => void
  onPlay: (episodeId: string) => void
  onOpenSettings: (podcastId: string) => void
  /** True when rendered as SplitView's detail pane (iPad Library) instead of
   * its own full-screen route — suppresses the phone-style "‹ Library" back
   * link, which would be redundant next to the sidebar and (at `rail` width)
   * SplitView's own back bar. See design_ipad spec §6 "Detail pane". */
  embedded?: boolean
}

export default function EpisodeListScreen({
  podcast,
  onBack,
  onPlay,
  onOpenSettings,
  embedded = false
}: Props): React.JSX.Element {
  const episodes = useStore((s) => s.episodesByPodcast[podcast.id] ?? [])
  const positions = useStore((s) => s.positions)
  const queue = useStore((s) => s.queue)
  const addToQueue = useStore((s) => s.addToQueue)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const setPlayed = useStore((s) => s.setPlayed)
  const downloadedUris = useStore((s) => s.downloadedUris)
  const downloadingIds = useStore((s) => s.downloadingIds)
  const downloadEpisode = useStore((s) => s.downloadEpisode)
  const removeDownload = useStore((s) => s.removeDownload)
  const libraryLoading = useStore((s) => s.libraryLoading)
  const loadLibrary = useStore((s) => s.loadLibrary)

  // Shows with hundreds of episodes had no quick way to jump to "what have
  // I started but not finished" — only the full chronological list.
  const [filter, setFilter] = useState<'all' | 'inProgress'>('all')
  const filteredEpisodes = useMemo(() => {
    if (filter === 'all') return episodes
    return episodes.filter((e) => !e.played && (positions[e.id] ?? 0) > 0)
  }, [episodes, filter, positions])

  const description = stripHtml(podcast.description)

  return (
    <View style={[styles.container, embedded && styles.containerEmbedded]}>
      <View style={styles.header}>
        {!embedded && (
          <Pressable onPress={onBack}>
            <Text style={styles.back}>{'‹ Library'}</Text>
          </Pressable>
        )}
        {embedded ? (
          // Bigger detail-pane header (spec §6): artwork + title read at a
          // glance without the phone's cramped single-line row, since the
          // sidebar already handles "back" — there's no drill-in to undo.
          <View style={styles.detailHeader}>
            <Artwork url={podcast.customArtworkUrl ?? podcast.artworkUrl} size={132} radius={radii.card} />
            <View style={styles.detailHeaderMeta}>
              <Text style={styles.detailTitle} numberOfLines={2}>
                {podcast.name}
              </Text>
              <Text style={styles.detailAuthor} numberOfLines={1}>
                {podcast.author}
              </Text>
              {description.length > 0 && (
                <Text style={styles.detailDescription} numberOfLines={3}>
                  {description}
                </Text>
              )}
              <Pressable
                style={styles.settingsPill}
                onPress={() => onOpenSettings(podcast.id)}
                accessibilityLabel="Podcast settings"
              >
                <Settings size={13} color={colors.accent} />
                <Text style={styles.settingsPillText}>Settings</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {podcast.name}
            </Text>
            <Pressable hitSlop={10} onPress={() => onOpenSettings(podcast.id)} accessibilityLabel="Podcast settings">
              <Settings size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All</Text>
          </Pressable>
          <Pressable
            style={[styles.filterBtn, filter === 'inProgress' && styles.filterBtnActive]}
            onPress={() => setFilter('inProgress')}
          >
            <Text style={[styles.filterText, filter === 'inProgress' && styles.filterTextActive]}>In Progress</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={filteredEpisodes}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
        onRefresh={loadLibrary}
        refreshing={libraryLoading}
        ListEmptyComponent={
          filter === 'inProgress' ? (
            <Text style={styles.empty}>Nothing in progress — episodes you start but don't finish show up here.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <EpisodeRow
            episode={item}
            podcast={podcast}
            position={positions[item.id] ?? 0}
            queued={queue.includes(item.id)}
            downloaded={Boolean(downloadedUris[item.id])}
            downloading={Boolean(downloadingIds[item.id])}
            onPlay={() => onPlay(item.id)}
            onToggleQueue={() => (queue.includes(item.id) ? removeFromQueue(item.id) : addToQueue(item.id))}
            onTogglePlayed={() => setPlayed(item.id, podcast.id, !item.played)}
            onToggleDownload={() =>
              downloadedUris[item.id] ? removeDownload(item.id) : downloadEpisode(item)
            }
          />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  containerEmbedded: { backgroundColor: colors.surface, paddingTop: 28 },
  header: { paddingHorizontal: 20, marginBottom: 12 },
  back: { color: colors.accent, marginBottom: 8, fontSize: 15 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: 12 },

  detailHeader: { flexDirection: 'row', gap: 20, marginBottom: 6 },
  detailHeaderMeta: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 4 },
  detailTitle: { fontSize: 26, fontWeight: '700', color: colors.textPrimary },
  detailAuthor: { fontSize: 13, color: colors.textMuted },
  detailDescription: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, marginTop: 4 },
  settingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.accentBg
  },
  settingsPillText: { fontSize: 12.5, fontWeight: '600', color: colors.accent },

  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: '#e8e8ed'
  },
  filterBtnActive: { backgroundColor: colors.accent },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  filterTextActive: { color: '#fff' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 },
  listContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    ...cardShadow
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10
  },
  epTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  epMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  descToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10
  },
  descToggleText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 }
})
