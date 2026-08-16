import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import { colors, radii, cardShadow } from '../theme'

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
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <SwipeToDelete deleteLabel="Remove" onDelete={() => removeFromQueue(item.episode.id)}>
            <Pressable style={styles.row} onPress={() => onPlay(item.podcast.id, item.episode.id)}>
              <Artwork url={item.episode.artworkUrl ?? item.podcast.artworkUrl} size={44} radius={radii.artworkSm} />
              <View style={{ flex: 1 }}>
                <Text style={styles.epTitle} numberOfLines={2}>
                  {item.episode.title}
                </Text>
                <Text style={styles.podcastName}>{item.podcast.name}</Text>
              </View>
            </Pressable>
          </SwipeToDelete>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Queue is empty. Add episodes from any episode list.</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { paddingHorizontal: 20, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  listContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    padding: 10,
    ...cardShadow
  },
  epTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  podcastName: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 }
})
