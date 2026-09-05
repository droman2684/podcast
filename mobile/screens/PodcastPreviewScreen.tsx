import { useEffect, useState } from 'react'
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { X } from 'lucide-react-native'
import type { DiscoverPodcast } from '@shared/types'
import type { Episode } from '@shared/types'
import { parseFeed } from '../lib/rss'
import { stripHtml } from '../lib/stripHtml'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  podcast: DiscoverPodcast | null
  subscribed: boolean
  subscribing: boolean
  onSubscribe: (podcast: DiscoverPodcast) => void
  onClose: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const PREVIEW_EPISODE_LIMIT = 20

// Tapping a search/discover result used to subscribe immediately — no way
// to see what a show even is before it's added to the Library. This fetches
// the feed the same way loadLibrary would, but never touches Supabase or
// calls subscribe() itself: only the explicit button below does that.
export default function PodcastPreviewScreen({ podcast, subscribed, subscribing, onSubscribe, onClose }: Props): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!podcast) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDescription('')
    setEpisodes([])
    parseFeed(podcast.feedUrl, podcast.id)
      .then((parsed) => {
        if (cancelled) return
        setDescription(parsed.description)
        setEpisodes(parsed.episodes)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [podcast])

  return (
    <Modal visible={podcast !== null} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Close">
            <X size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        {podcast && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.showHeader}>
              <Artwork url={podcast.artworkUrl} size={84} radius={radii.card} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={3}>
                  {podcast.name}
                </Text>
                <Text style={styles.author} numberOfLines={1}>
                  {podcast.author}
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.subBtn, subscribed && styles.subBtnDone]}
              disabled={subscribed || subscribing}
              onPress={() => onSubscribe(podcast)}
            >
              <Text style={styles.subBtnText}>
                {subscribed ? 'Subscribed' : subscribing ? 'Subscribing…' : 'Subscribe'}
              </Text>
            </Pressable>

            {loading && <ActivityIndicator style={{ marginTop: 24 }} />}
            {error && <Text style={styles.error}>Couldn't load this show: {error}</Text>}

            {!loading && !error && (
              <>
                {description ? <Text style={styles.description}>{stripHtml(description)}</Text> : null}

                <Text style={styles.episodesHeader}>
                  Episodes{episodes.length > 0 ? ` (${episodes.length})` : ''}
                </Text>
                {episodes.slice(0, PREVIEW_EPISODE_LIMIT).map((episode) => (
                  <View key={episode.id} style={styles.episodeRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.episodeTitle} numberOfLines={2}>
                        {episode.title}
                      </Text>
                      <Text style={styles.episodeMeta}>{formatDate(episode.pubDateIso)}</Text>
                      <Text style={styles.episodeDesc} numberOfLines={2}>
                        {stripHtml(episode.description)}
                      </Text>
                    </View>
                  </View>
                ))}
                {episodes.length === 0 && <Text style={styles.empty}>No episodes found in this feed.</Text>}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: { paddingHorizontal: 20, marginBottom: 8 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  showHeader: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  name: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  author: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  subBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20
  },
  subBtnDone: { backgroundColor: colors.textDisabled },
  subBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { color: colors.danger, marginTop: 16 },
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 20 },
  episodesHeader: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  episodeRow: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    marginBottom: 8,
    ...cardShadow
  },
  episodeTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  episodeMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  episodeDesc: { fontSize: 11.5, color: colors.textMuted, marginTop: 3, lineHeight: 15 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20 }
})
