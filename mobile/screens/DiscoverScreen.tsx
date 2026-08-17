import { useEffect, useState } from 'react'
import { View, Text, TextInput, ScrollView, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Search, X } from 'lucide-react-native'
import type { DiscoverPodcast } from '@shared/types'
import { CATEGORY_GENRE_IDS, getCategoryPicks, getPodcastOfTheDay, searchPodcasts } from '../lib/itunes'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

const CATEGORIES = Object.keys(CATEGORY_GENRE_IDS)

// Search and Discover used to be separate tabs — merged per request, with a
// search field at the top of this screen replacing the browse content
// (daily pick / category picks) whenever there's a non-empty search term,
// rather than living side by side with it.
export default function DiscoverScreen(): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const subscribe = useStore((s) => s.subscribe)
  const subscribedIds = new Set(podcasts.map((p) => p.id))

  const [category, setCategory] = useState(CATEGORIES[0])
  const [picks, setPicks] = useState<DiscoverPodcast[]>([])
  const [dailyPick, setDailyPick] = useState<DiscoverPodcast | null>(null)
  const [picksLoading, setPicksLoading] = useState(false)
  const [subscribingId, setSubscribingId] = useState<string | null>(null)

  const [term, setTerm] = useState('')
  const [searchResults, setSearchResults] = useState<DiscoverPodcast[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchActive = term.trim().length > 0

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

  const runSearch = async (): Promise<void> => {
    if (!term.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      setSearchResults(await searchPodcasts(term))
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  const handleSubscribe = async (podcast: DiscoverPodcast): Promise<void> => {
    setSubscribingId(podcast.id)
    try {
      await subscribe(podcast)
    } finally {
      setSubscribingId(null)
    }
  }

  const renderPodcastRow = (item: DiscoverPodcast): React.JSX.Element => {
    const subscribed = subscribedIds.has(item.id)
    return (
      <View style={styles.row} key={item.id}>
        <Artwork url={item.artworkUrl} size={48} radius={radii.artworkSm} />
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
          <Text style={styles.subBtnText}>{subscribed ? 'Added' : subscribingId === item.id ? '…' : 'Subscribe'}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discover</Text>

      <View style={styles.searchRow}>
        <Search size={16} color={colors.textPlaceholder} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search podcasts"
          value={term}
          onChangeText={setTerm}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />
        {searchActive && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setTerm('')
              setSearchResults([])
            }}
          >
            <X size={16} color={colors.textPlaceholder} />
          </Pressable>
        )}
      </View>

      {searchActive ? (
        <>
          {searching && <ActivityIndicator style={{ marginTop: 20 }} />}
          {searchError && <Text style={styles.error}>{searchError}</Text>}
          <FlatList
            data={searchResults}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.searchContent}
            renderItem={({ item }) => renderPodcastRow(item)}
          />
        </>
      ) : (
        <>
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
        </>
      )}
    </View>
  )
}

const PICK_ART_SIZE = 104

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 12 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.input
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  error: { color: colors.danger, paddingHorizontal: 20, marginBottom: 8 },
  searchContent: { paddingHorizontal: 20, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    ...cardShadow
  },
  name: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  author: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  subBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  subBtnDone: { backgroundColor: colors.textDisabled },
  subBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
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
