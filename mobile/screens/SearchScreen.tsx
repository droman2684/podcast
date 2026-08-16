import { useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import type { DiscoverPodcast } from '@shared/types'
import { searchPodcasts } from '../lib/itunes'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'

export default function SearchScreen(): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const subscribe = useStore((s) => s.subscribe)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<DiscoverPodcast[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscribingId, setSubscribingId] = useState<string | null>(null)

  const subscribedIds = new Set(podcasts.map((p) => p.id))

  const runSearch = async (): Promise<void> => {
    if (!term.trim()) return
    setLoading(true)
    setError(null)
    try {
      setResults(await searchPodcasts(term))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubscribe = async (podcast: DiscoverPodcast): Promise<void> => {
    setSubscribingId(podcast.id)
    try {
      await subscribe(podcast)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubscribingId(null)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TextInput
          style={styles.input}
          placeholder="Search podcasts"
          value={term}
          onChangeText={setTerm}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
      </View>
      {loading && <ActivityIndicator style={{ marginTop: 20 }} />}
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const subscribed = subscribedIds.has(item.id)
          return (
            <View style={styles.row}>
              <Artwork url={item.artworkUrl} size={48} radius={8} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.author} numberOfLines={1}>
                  {item.author}
                </Text>
              </View>
              <Pressable
                style={[styles.subBtn, subscribed && styles.subBtnDone]}
                disabled={subscribed || subscribingId === item.id}
                onPress={() => handleSubscribe(item)}
              >
                <Text style={styles.subBtnText}>
                  {subscribed ? 'Added' : subscribingId === item.id ? '…' : 'Subscribe'}
                </Text>
              </Pressable>
            </View>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60 },
  header: { paddingHorizontal: 20, marginBottom: 12, gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    fontSize: 15
  },
  error: { color: '#d33', paddingHorizontal: 20, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10
  },
  name: { fontSize: 14, fontWeight: '600' },
  author: { fontSize: 12, color: '#888', marginTop: 2 },
  subBtn: {
    backgroundColor: '#FF5910',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  subBtnDone: { backgroundColor: '#ccc' },
  subBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 }
})
