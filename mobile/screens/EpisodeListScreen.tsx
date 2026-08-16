import { useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { Settings, ChevronDown, ChevronUp, Download, Trash2 } from 'lucide-react-native'
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
        <Pressable hitSlop={10} onPress={onToggleQueue}>
          <Text style={[styles.iconBtn, queued && styles.iconBtnActive]}>{queued ? '✓' : '+'}</Text>
        </Pressable>
        <Pressable hitSlop={10} onPress={onTogglePlayed}>
          <Text style={styles.iconBtn}>{episode.played ? '↺' : '✓'}</Text>
        </Pressable>
        <Pressable hitSlop={10} onPress={onToggleDownload} disabled={downloading}>
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
}

export default function EpisodeListScreen({ podcast, onBack, onPlay, onOpenSettings }: Props): React.JSX.Element {
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'‹ Library'}</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {podcast.name}
          </Text>
          <Pressable hitSlop={10} onPress={() => onOpenSettings(podcast.id)}>
            <Settings size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
      <FlatList
        data={episodes}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.listContent}
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
  header: { paddingHorizontal: 20, marginBottom: 12 },
  back: { color: colors.accent, marginBottom: 8, fontSize: 15 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: 12 },
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
  iconBtn: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '700',
    width: 26,
    height: 26,
    textAlign: 'center',
    lineHeight: 26,
    borderRadius: 13,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden'
  },
  iconBtnActive: { color: '#fff', backgroundColor: colors.accent },
  descToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 10
  },
  descToggleText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 17 }
})
