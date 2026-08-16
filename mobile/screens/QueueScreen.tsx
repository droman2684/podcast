import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'

interface QueueItem {
  podcast: Podcast
  episode: Episode
}

interface Props {
  onPlay: (podcastId: string, episodeId: string) => void
}

export default function QueueScreen({ onPlay }: Props): React.JSX.Element {
  const queue = useStore((s) => s.queue)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const removeFromQueue = useStore((s) => s.removeFromQueue)

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Queue</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.episode.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => onPlay(item.podcast.id, item.episode.id)}
          >
            <Artwork url={item.episode.artworkUrl ?? item.podcast.artworkUrl} size={44} radius={7} />
            <View style={{ flex: 1 }}>
              <Text style={styles.epTitle} numberOfLines={2}>
                {item.episode.title}
              </Text>
              <Text style={styles.podcastName}>{item.podcast.name}</Text>
            </View>
            <Pressable hitSlop={10} onPress={() => removeFromQueue(item.episode.id)}>
              <Text style={styles.removeBtn}>✕</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Queue is empty. Add episodes from any episode list.</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  header: { paddingHorizontal: 20, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee'
  },
  epTitle: { fontSize: 15, fontWeight: '600' },
  podcastName: { fontSize: 12, color: '#888', marginTop: 2 },
  removeBtn: { fontSize: 16, color: '#d33', paddingHorizontal: 6 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, paddingHorizontal: 30 }
})
