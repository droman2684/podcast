import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Play, Pause, ListPlus, X, Check, Settings } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import { getEffectiveQueue } from '../lib/queueOrder'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

// Mirrors the desktop Home screen (src/renderer/src/components/screens/
// HomeScreen.tsx): a featured banner for the newest unplayed episode, the
// head of the queue, and the newest unplayed episodes across every show.
const HOME_QUEUE_LIMIT = 6
const RECENT_LIMIT = 6

interface Item {
  podcast: Podcast
  episode: Episode
}

interface Props {
  onPlay: (podcastId: string, episodeId: string, autoplay?: boolean) => void
  onSeeQueue: () => void
  onBrowseDiscover: () => void
  onOpenAppSettings: () => void
}

function formatDuration(sec: number): string {
  if (!sec) return ''
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function HomeScreen({
  onPlay,
  onSeeQueue,
  onBrowseDiscover,
  onOpenAppSettings
}: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  // Playback order (auto or manual) — see getEffectiveQueue.
  const queue = useStore(getEffectiveQueue)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const liveDuration = useStore((s) => s.duration)
  const positions = useStore((s) => s.positions)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const togglePlay = useStore((s) => s.togglePlay)
  const addToQueue = useStore((s) => s.addToQueue)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const setPlayed = useStore((s) => s.setPlayed)

  const byEpisodeId = useMemo(() => {
    const map = new Map<string, Item>()
    for (const podcast of podcasts) {
      for (const episode of episodesByPodcast[podcast.id] ?? []) map.set(episode.id, { podcast, episode })
    }
    return map
  }, [podcasts, episodesByPodcast])

  const upNext = useMemo(
    () =>
      queue
        .map((id) => byEpisodeId.get(id))
        .filter((item): item is Item => item !== undefined)
        .slice(0, HOME_QUEUE_LIMIT),
    [queue, byEpisodeId]
  )

  const recent = useMemo(
    () =>
      Array.from(byEpisodeId.values())
        .filter((item) => !item.episode.played)
        .sort((a, b) => (a.episode.pubDateIso < b.episode.pubDateIso ? 1 : -1))
        .slice(0, RECENT_LIMIT),
    [byEpisodeId]
  )

  const queued = useMemo(() => new Set(queue), [queue])

  // Same as the Queue screen: starting playback lands on the Player; pausing
  // stays put.
  const handlePlayToggle = (item: Item): void => {
    const isCurrent = currentEpisodeId === item.episode.id
    const willPlay = !(isCurrent && playing)
    if (isCurrent) togglePlay()
    else loadEpisode(item.episode.id, { autoplay: true })
    if (willPlay) onPlay(item.podcast.id, item.episode.id)
  }

  const progressOf = (episode: Episode): number => {
    const isCurrent = currentEpisodeId === episode.id
    const positionSec = isCurrent ? currentTimeSec : (positions[episode.id] ?? 0)
    const durationSec = episode.durationSec > 0 ? episode.durationSec : isCurrent ? liveDuration : 0
    return durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0
  }

  const renderRow = (item: Item, kind: 'queue' | 'recent'): React.JSX.Element => {
    const { podcast, episode } = item
    const isPlaying = currentEpisodeId === episode.id && playing
    const progress = progressOf(episode)
    const inQueue = queued.has(episode.id)
    return (
      <View key={`${kind}:${episode.id}`} style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => onPlay(podcast.id, episode.id, true)}>
          <Artwork
            url={podcast.customArtworkUrl ?? episode.artworkUrl ?? podcast.artworkUrl}
            size={48}
            radius={radii.artworkSm}
          />
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              {kind === 'recent' && <View style={styles.newDot} />}
              <Text style={styles.epTitle} numberOfLines={1}>
                {episode.title}
              </Text>
            </View>
            <Text style={styles.epSub} numberOfLines={1}>
              {podcast.name}
              {episode.durationSec > 0 ? ` · ${formatDuration(episode.durationSec)}` : ''}
            </Text>
            {progress > 0 && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>
        </Pressable>
        {kind === 'queue' ? (
          <>
            <Pressable
              hitSlop={8}
              style={styles.iconBtn}
              onPress={() => setPlayed(episode.id, podcast.id, !episode.played)}
              accessibilityLabel={episode.played ? 'Mark as unplayed' : 'Mark as played'}
            >
              <Check
                size={16}
                color={episode.played ? colors.accent : colors.navInactive}
                strokeWidth={episode.played ? 3 : 2}
              />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.iconBtn}
              onPress={() => removeFromQueue(episode.id)}
              accessibilityLabel="Remove from queue"
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              hitSlop={8}
              style={styles.iconBtn}
              onPress={() => setPlayed(episode.id, podcast.id, true)}
              accessibilityLabel="Mark as played"
            >
              <Check size={16} color={colors.navInactive} />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.iconBtn}
              disabled={inQueue}
              onPress={() => addToQueue(episode.id)}
              accessibilityLabel={inQueue ? 'Already in queue' : 'Add to queue'}
            >
              <ListPlus size={16} color={inQueue ? colors.textDisabled : colors.navInactive} />
            </Pressable>
          </>
        )}
        <Pressable
          hitSlop={8}
          style={styles.playBtn}
          onPress={() => handlePlayToggle(item)}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={13} color={colors.accent} fill={colors.accent} />
          ) : (
            <Play size={13} color={colors.accent} fill={colors.accent} style={{ marginLeft: 1 }} />
          )}
        </Pressable>
      </View>
    )
  }

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Home</Text>
      <Pressable hitSlop={10} onPress={onOpenAppSettings} accessibilityLabel="Settings">
        <Settings size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  )

  if (podcasts.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Subscribe to a podcast to see it here.</Text>
          <Pressable style={styles.emptyBtn} onPress={onBrowseDiscover}>
            <Text style={styles.emptyBtnText}>Discover podcasts</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const featured = recent[0]
  const featuredPlaying = featured && currentEpisodeId === featured.episode.id && playing

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        {featured && (
          <View style={styles.banner}>
            <View style={styles.bannerCircleA} />
            <View style={styles.bannerCircleB} />
            <Pressable onPress={() => onPlay(featured.podcast.id, featured.episode.id, true)}>
              <Artwork
                url={featured.podcast.customArtworkUrl ?? featured.episode.artworkUrl ?? featured.podcast.artworkUrl}
                size={88}
                radius={14}
              />
            </Pressable>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle} numberOfLines={3}>
                {featured.episode.title}
              </Text>
              <Text style={styles.bannerMeta} numberOfLines={1}>
                {featured.podcast.name}
                {featured.episode.durationSec > 0 ? ` · ${formatDuration(featured.episode.durationSec)}` : ''}
              </Text>
              <Pressable style={styles.bannerBtn} onPress={() => handlePlayToggle(featured)}>
                {featuredPlaying ? (
                  <Pause size={12} color="#fff" fill="#fff" />
                ) : (
                  <Play size={12} color="#fff" fill="#fff" />
                )}
                <Text style={styles.bannerBtnText}>{featuredPlaying ? 'Pause' : 'Play Now'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Queue</Text>
            {queue.length > 0 && (
              <Pressable hitSlop={8} onPress={onSeeQueue}>
                <Text style={styles.seeAll}>See all ({queue.length})</Text>
              </Pressable>
            )}
          </View>
          {upNext.length === 0 ? (
            <Text style={styles.sectionEmpty}>Your queue is empty — add episodes from New Episodes below.</Text>
          ) : (
            upNext.map((item) => renderRow(item, 'queue'))
          )}
        </View>

        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>New Episodes</Text>
          </View>
          {recent.length === 0 ? (
            <Text style={styles.sectionEmpty}>You&apos;re all caught up.</Text>
          ) : (
            recent.map((item) => renderRow(item, 'recent'))
          )}
        </View>
      </ScrollView>
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
    marginBottom: 12
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 22 },
  banner: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.brand,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  bannerCircleA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  bannerCircleB: {
    position: 'absolute',
    bottom: -60,
    right: 60,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  bannerText: { flex: 1, gap: 8 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', lineHeight: 21 },
  bannerMeta: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  bannerBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.accent
  },
  bannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  seeAll: { fontSize: 13, fontWeight: '600', color: colors.accent },
  sectionEmpty: { fontSize: 13, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 8,
    marginBottom: 8,
    ...cardShadow
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  newDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  epTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  epSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: '#e8e8ed', marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: colors.accent },
  iconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f0f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 16 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.accent },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 }
})
