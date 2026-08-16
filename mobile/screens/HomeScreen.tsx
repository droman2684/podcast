import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Play, Pause, ListPlus, Check, Settings } from 'lucide-react-native'
import type { Episode } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

const RECENT_LIMIT = 12

function formatDuration(sec: number): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

interface Props {
  onOpenPlayer: (podcastId: string, episodeId: string) => void
  onOpenSettings: () => void
}

// Mirrors the desktop app's HomeScreen.tsx: a featured banner for the most
// recent unplayed episode, plus a New Episodes list for quickly queuing or
// marking played without drilling into a show's episode list.
export default function HomeScreen({ onOpenPlayer, onOpenSettings }: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const queue = useStore((s) => s.queue)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const togglePlay = useStore((s) => s.togglePlay)
  const addToQueue = useStore((s) => s.addToQueue)
  const setPlayed = useStore((s) => s.setPlayed)

  // Flattening/sorting every episode across every podcast is real work for a
  // library with thousands of episodes — recomputing it on every render
  // (including ones triggered by unrelated state like `playing` toggling)
  // was making basic interactions like tapping Play feel heavy.
  const podcastById = useMemo(() => new Map(podcasts.map((p) => [p.id, p])), [podcasts])
  const allEpisodes = useMemo(() => Object.values(episodesByPodcast).flat(), [episodesByPodcast])

  const recent = useMemo(
    () =>
      allEpisodes
        .filter((e) => !e.played)
        .sort((a, b) => (a.pubDateIso < b.pubDateIso ? 1 : -1))
        .slice(0, RECENT_LIMIT),
    [allEpisodes]
  )

  const handlePlayToggle = (episodeId: string): void => {
    if (currentEpisodeId === episodeId) togglePlay()
    else loadEpisode(episodeId, { autoplay: true })
  }

  const featured = recent[0]

  if (podcasts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Home</Text>
          <Pressable hitSlop={10} onPress={onOpenSettings}>
            <Settings size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.empty}>Subscribe to a podcast from Search to see it here.</Text>
      </View>
    )
  }

  const renderEpisodeRow = (ep: Episode): React.JSX.Element => {
    const podcast = podcastById.get(ep.podcastId)
    const isPlaying = currentEpisodeId === ep.id && playing
    const inQueue = queue.includes(ep.id)
    return (
      <Pressable
        key={ep.id}
        style={styles.row}
        onPress={() => onOpenPlayer(ep.podcastId, ep.id)}
      >
        <Artwork url={podcast?.customArtworkUrl ?? ep.artworkUrl} size={48} radius={radii.artworkSm} />
        <View style={{ flex: 1 }}>
          <Text style={styles.epTitle} numberOfLines={1}>
            {ep.title}
          </Text>
          <Text style={styles.epMeta} numberOfLines={1}>
            {podcast?.name} · {formatDuration(ep.durationSec)}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation()
            setPlayed(ep.id, ep.podcastId, !ep.played)
          }}
        >
          <Check size={16} color={ep.played ? colors.accent : colors.textMuted} strokeWidth={ep.played ? 3 : 2} />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation()
            if (!inQueue) addToQueue(ep.id)
          }}
        >
          <ListPlus size={16} color={inQueue ? colors.textDisabled : colors.textMuted} />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation()
            handlePlayToggle(ep.id)
          }}
        >
          {isPlaying ? (
            <Pause size={16} color={colors.accent} fill={colors.accent} />
          ) : (
            <Play size={16} color={colors.accent} fill={colors.accent} />
          )}
        </Pressable>
      </Pressable>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Home</Text>
        <Pressable hitSlop={10} onPress={onOpenSettings}>
          <Settings size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {featured && (
            <Pressable style={styles.banner} onPress={() => onOpenPlayer(featured.podcastId, featured.id)}>
              <Artwork
                url={featured.artworkUrl ?? podcastById.get(featured.podcastId)?.artworkUrl ?? null}
                size={72}
                radius={12}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle} numberOfLines={2}>
                  {featured.title}
                </Text>
                <Text style={styles.bannerMeta} numberOfLines={1}>
                  {podcastById.get(featured.podcastId)?.name} · {formatDuration(featured.durationSec)}
                </Text>
                <Pressable
                  style={styles.playPill}
                  onPress={(e) => {
                    e.stopPropagation()
                    handlePlayToggle(featured.id)
                  }}
                >
                  {currentEpisodeId === featured.id && playing ? (
                    <Pause size={12} color="#fff" fill="#fff" />
                  ) : (
                    <Play size={12} color="#fff" fill="#fff" />
                  )}
                  <Text style={styles.playPillText}>
                    {currentEpisodeId === featured.id && playing ? 'Pause' : 'Play Now'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          )}

      <Text style={styles.sectionTitle}>New Episodes</Text>
      <View style={[styles.section, { marginBottom: 20 }]}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>You're all caught up.</Text>
        ) : (
          recent.map((ep) => renderEpisodeRow(ep))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.brand
  },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  bannerMeta: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  playPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 8
  },
  playPillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPlaceholder,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 20,
    marginBottom: 8
  },
  section: { paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    padding: 10,
    ...cardShadow
  },
  epTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  epMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 20, marginBottom: 20 }
})
