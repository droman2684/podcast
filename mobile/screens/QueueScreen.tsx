import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, type GestureResponderHandlers } from 'react-native'
import { GripVertical, Play, Pause } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { groupByPodcast } from '@shared/queueView'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import DraggableList from '../components/DraggableList'
import { colors, radii, cardShadow } from '../theme'

interface QueueItem {
  podcast: Podcast
  episode: Episode
}

interface Props {
  onPlay: (podcastId: string, episodeId: string) => void
}

const ROW_SLOT_HEIGHT = 72
const ROW_HEIGHT = 64

export default function QueueScreen({ onPlay }: Props): React.JSX.Element {
  const queue = useStore((s) => s.queue)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const reorderQueue = useStore((s) => s.reorderQueue)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const togglePlay = useStore((s) => s.togglePlay)

  // Drag-to-reorder only applies to the plain manual order — once grouped
  // by show, "reorder" would mean something different (reorder within a
  // group? reorder the groups themselves?) that this list can't express,
  // so grouped view is browse/remove only.
  const [grouped, setGrouped] = useState(false)

  const podcastById = new Map(podcasts.map((p) => [p.id, p]))
  const items: QueueItem[] = []
  for (const episodeId of queue) {
    for (const podcast of podcasts) {
      const episode = episodesByPodcast[podcast.id]?.find((e) => e.id === episodeId)
      if (episode) {
        items.push({ podcast, episode })
        break
      }
    }
  }

  const handlePlayToggle = (episodeId: string): void => {
    if (currentEpisodeId === episodeId) togglePlay()
    else loadEpisode(episodeId, { autoplay: true })
  }

  const renderRow = (
    item: QueueItem,
    isActive: boolean,
    dragHandlers?: GestureResponderHandlers
  ): React.JSX.Element => {
    const isCurrent = currentEpisodeId === item.episode.id
    return (
      <View style={[styles.row, isActive && styles.rowActive]}>
        {dragHandlers && (
          <View {...dragHandlers}>
            <GripVertical size={18} color={colors.textDisabled} />
          </View>
        )}
        <Pressable style={styles.rowMain} onPress={() => onPlay(item.podcast.id, item.episode.id)}>
          <Artwork
            url={item.episode.artworkUrl ?? item.podcast.artworkUrl}
            size={44}
            radius={radii.artworkSm}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.epTitle} numberOfLines={1}>
              {item.episode.title}
            </Text>
            <Text style={styles.podcastName}>{item.podcast.name}</Text>
          </View>
        </Pressable>
        <Pressable hitSlop={10} onPress={() => handlePlayToggle(item.episode.id)}>
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
        <Text style={styles.empty}>Queue is empty. Add episodes from Home or any episode list.</Text>
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
        <ScrollView contentContainerStyle={styles.listContent}>
          <DraggableList
            data={items}
            keyExtractor={(item) => item.episode.id}
            itemHeight={ROW_SLOT_HEIGHT}
            onReorder={(reordered) => reorderQueue(reordered.map((r) => r.episode.id))}
            renderItem={(item, isActive, dragHandlers) => (
              <SwipeToDelete deleteLabel="Remove" onDelete={() => removeFromQueue(item.episode.id)}>
                {renderRow(item, isActive, dragHandlers)}
              </SwipeToDelete>
            )}
          />
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
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  epTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  podcastName: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 }
})
