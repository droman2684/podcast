import { useEffect } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'

interface Props {
  onSelectPodcast: (id: string) => void
  onOpenSettings: (id: string) => void
}

export default function LibraryScreen({ onSelectPodcast, onOpenSettings }: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const loading = useStore((s) => s.libraryLoading)
  const error = useStore((s) => s.libraryError)
  const loadLibrary = useStore((s) => s.loadLibrary)

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  const renderItem = ({ item }: { item: Podcast }): React.JSX.Element => (
    <Pressable style={styles.row} onPress={() => onSelectPodcast(item.id)}>
      <Artwork url={item.customArtworkUrl ?? item.artworkUrl} size={48} radius={8} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.author}>{item.author}</Text>
      </View>
      {item.unread > 0 && <Text style={styles.badge}>{item.unread}</Text>}
      <Pressable hitSlop={10} onPress={() => onOpenSettings(item.id)}>
        <Text style={styles.settingsBtn}>{'⋯'}</Text>
      </Pressable>
    </Pressable>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={podcasts}
        keyExtractor={(p) => p.id}
        onRefresh={loadLibrary}
        refreshing={loading}
        renderItem={renderItem}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No synced subscriptions found yet. Subscribe on desktop or from the Search tab, then
              pull down to refresh here.
            </Text>
          ) : (
            <ActivityIndicator style={{ marginTop: 40 }} />
          )
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12
  },
  title: { fontSize: 24, fontWeight: '700' },
  error: { color: '#d33', paddingHorizontal: 20, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12
  },
  name: { fontSize: 15, fontWeight: '600' },
  author: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: {
    backgroundColor: '#FF5910',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden'
  },
  settingsBtn: { fontSize: 20, color: '#888', paddingHorizontal: 6 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40, paddingHorizontal: 30 }
})
