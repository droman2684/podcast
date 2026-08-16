import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'

function formatDuration(sec: number): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

interface Props {
  podcast: Podcast
  onBack: () => void
  onPlay: (episodeId: string) => void
}

export default function EpisodeListScreen({ podcast, onBack, onPlay }: Props): React.JSX.Element {
  const episodes = useStore((s) => s.episodesByPodcast[podcast.id] ?? [])
  const positions = useStore((s) => s.positions)
  const queue = useStore((s) => s.queue)
  const addToQueue = useStore((s) => s.addToQueue)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const setPlayed = useStore((s) => s.setPlayed)

  const renderItem = ({ item }: { item: Episode }): React.JSX.Element => {
    const pos = positions[item.id] ?? 0
    const queued = queue.includes(item.id)
    return (
      <Pressable style={styles.row} onPress={() => onPlay(item.id)}>
        <Artwork url={item.artworkUrl ?? podcast.artworkUrl} size={44} radius={7} />
        <View style={{ flex: 1 }}>
          <Text style={styles.epTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.epMeta}>
            {new Date(item.pubDateIso).toLocaleDateString()} · {formatDuration(item.durationSec)}
            {item.played ? ' · Played' : pos > 0 ? ` · ${formatDuration(pos)} in` : ''}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => (queued ? removeFromQueue(item.id) : addToQueue(item.id))}
        >
          <Text style={[styles.iconBtn, queued && styles.iconBtnActive]}>{queued ? '✓' : '+'}</Text>
        </Pressable>
        <Pressable hitSlop={10} onPress={() => setPlayed(item.id, podcast.id, !item.played)}>
          <Text style={styles.iconBtn}>{item.played ? '↺' : '✓'}</Text>
        </Pressable>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'‹ Library'}</Text>
        </Pressable>
        <Text style={styles.title}>{podcast.name}</Text>
      </View>
      <FlatList data={episodes} keyExtractor={(e) => e.id} renderItem={renderItem} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  header: { paddingHorizontal: 20, marginBottom: 12 },
  back: { color: '#FF5910', marginBottom: 8, fontSize: 15 },
  title: { fontSize: 22, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee'
  },
  epTitle: { fontSize: 15, fontWeight: '600' },
  epMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  iconBtn: {
    fontSize: 16,
    color: '#888',
    fontWeight: '700',
    width: 26,
    height: 26,
    textAlign: 'center',
    lineHeight: 26,
    borderRadius: 13,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden'
  },
  iconBtnActive: { color: '#fff', backgroundColor: '#FF5910' }
})
