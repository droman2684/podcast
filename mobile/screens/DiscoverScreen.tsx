import { useEffect, useState } from 'react'
import { View, Text, ScrollView, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import type { DiscoverPodcast } from '@shared/types'
import { CATEGORY_GENRE_IDS, getCategoryPicks, getPodcastOfTheDay } from '../lib/itunes'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { colors, radii } from '../theme'

const CATEGORIES = Object.keys(CATEGORY_GENRE_IDS)

export default function DiscoverScreen(): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const subscribe = useStore((s) => s.subscribe)
  const subscribedIds = new Set(podcasts.map((p) => p.id))

  const [category, setCategory] = useState(CATEGORIES[0])
  const [picks, setPicks] = useState<DiscoverPodcast[]>([])
  const [dailyPick, setDailyPick] = useState<DiscoverPodcast | null>(null)
  const [picksLoading, setPicksLoading] = useState(false)
  const [subscribingId, setSubscribingId] = useState<string | null>(null)

  useEffect(() => {
    getPodcastOfTheDay()
      .then(setDailyPick)
      .catch((err) => console.error('Failed to load daily pick:', err))
  }, [])

  // Cached per category in lib/itunes.ts, so revisiting a category already
  // viewed this session is instant — only the very first fetch for a given
  // category is a real network round trip.
  useEffect(() => {
    let cancelled = false
    setPicksLoading(true)
    getCategoryPicks(category)
      .then((p) => !cancelled && setPicks(p))
      .catch((err) => console.error('Failed to load category picks:', err))
      .finally(() => !cancelled && setPicksLoading(false))
    return () => {
      cancelled = true
    }
  }, [category])

  const handleSubscribe = async (podcast: DiscoverPodcast): Promise<void> => {
    setSubscribingId(podcast.id)
    try {
      await subscribe(podcast)
    } finally {
      setSubscribingId(null)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discover</Text>

      {dailyPick && (
        <Pressable
          style={styles.dailyPick}
          onPress={() => !subscribedIds.has(dailyPick.id) && handleSubscribe(dailyPick)}
        >
          <Artwork url={dailyPick.artworkUrl} size={52} radius={10} />
          <View style={{ flex: 1 }}>
            <Text style={styles.dailyPickLabel}>Podcast of the day</Text>
            <Text style={styles.dailyPickName} numberOfLines={1}>
              {dailyPick.name}
            </Text>
          </View>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            style={[styles.chip, c === category && styles.chipActive]}
            onPress={() => setCategory(c)}
          >
            <Text style={[styles.chipText, c === category && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {picksLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={picks}
          keyExtractor={(p) => p.id}
          numColumns={3}
          columnWrapperStyle={styles.picksRow}
          contentContainerStyle={styles.picksContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.pickCard}
              onPress={() => !subscribedIds.has(item.id) && handleSubscribe(item)}
            >
              <Artwork url={item.artworkUrl} size={PICK_ART_SIZE} radius={10} />
              <Text style={styles.pickName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.pickAction}>
                {subscribedIds.has(item.id) ? 'Added' : subscribingId === item.id ? '…' : '+ Add'}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const PICK_ART_SIZE = 104

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 12 },
  dailyPick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 10,
    borderRadius: radii.card,
    backgroundColor: colors.accentBg
  },
  dailyPickLabel: { fontSize: 11, color: colors.accent, fontWeight: '700', textTransform: 'uppercase' },
  dailyPickName: { fontSize: 15, fontWeight: '600', marginTop: 2, color: colors.textPrimary },
  chipRow: { paddingLeft: 20, marginBottom: 14, flexGrow: 0 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: '#e8e8ed',
    marginRight: 8
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  picksContent: { paddingHorizontal: 20, paddingBottom: 20 },
  picksRow: { gap: 14, marginBottom: 14 },
  pickCard: { flex: 1, maxWidth: `${100 / 3}%` },
  pickName: { fontSize: 12, fontWeight: '600', marginTop: 6, color: colors.textPrimary },
  pickAction: { fontSize: 11, color: colors.accent, fontWeight: '700', marginTop: 2 }
})
