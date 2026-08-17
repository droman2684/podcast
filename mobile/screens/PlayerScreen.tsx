import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { ChevronDown, Play, Pause, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { nextInQueue, previousInQueue } from '@shared/queueView'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { stripHtml } from '../lib/stripHtml'
import { useScrubBar } from '../lib/useScrubBar'
import { buildEpisodeIndex } from '../lib/episodeIndex'
import { colors, radii } from '../theme'
import type { LayoutMode } from '../lib/useLayout'

const SPEEDS = [1, 1.25, 1.5, 1.75, 2]

function nextSpeed(current: number): number {
  const idx = SPEEDS.indexOf(current)
  return SPEEDS[(idx === -1 ? 0 : idx + 1) % SPEEDS.length]
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  episode: Episode
  podcast: Podcast
  onBack: () => void
  /** Omit (or 'compact') for the phone full-screen layout. 'rail'/'regular'
   * render this as the iPad Now Playing pane instead — see spec §6/§7. */
  mode?: LayoutMode
}

// A thin view onto the global AudioEngine (components/AudioEngine.tsx) —
// this screen no longer owns a player instance, so navigating away doesn't
// stop playback and Home/Queue see the same live state.
export default function PlayerScreen({ episode, podcast, onBack, mode = 'compact' }: Props): React.JSX.Element {
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const duration = useStore((s) => s.duration)
  const playbackRate = useStore((s) => s.playbackRate)
  const skipBackSec = useStore((s) => s.skipBackSec)
  const skipForwardSec = useStore((s) => s.skipForwardSec)
  const togglePlay = useStore((s) => s.togglePlay)
  const requestSeek = useStore((s) => s.requestSeek)
  const setPlaybackRate = useStore((s) => s.setPlaybackRate)
  const queue = useStore((s) => s.queue)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const playNextInQueue = useStore((s) => s.playNextInQueue)
  const playPreviousInQueue = useStore((s) => s.playPreviousInQueue)

  const { onBarLayout, panHandlers, progress, displayedTimeSec, scrubbing } = useScrubBar({
    duration,
    currentTimeSec,
    onSeek: requestSeek
  })

  const description = stripHtml(episode.description)
  const isTablet = mode !== 'compact'

  // Up next in the queue, current episode excluded — it stays playing at
  // the top of the actual Queue tab, but repeating it here would read as
  // "play this again" right under the transport controls for it.
  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])
  const podcastById = useMemo(() => new Map(podcasts.map((p) => [p.id, p])), [podcasts])
  const upNext = useMemo(
    () =>
      queue
        .filter((id) => id !== episode.id)
        .map((id) => episodeIndex.get(id))
        .filter((e): e is Episode => e !== undefined),
    [queue, episode.id, episodeIndex]
  )

  // Media-center-style transport (mirrors desktop's NowPlayingPanel):
  // previous-in-queue / rewind / play-pause / fast-forward / next-in-queue,
  // rather than just a skip button and a play/pause button. Previous/Next
  // dim rather than disappear when there's nothing to skip to, so the row
  // doesn't reflow depending on queue position.
  const canGoPrevious = previousInQueue(queue, episode.id) !== null
  const canGoNext = nextInQueue(queue, episode.id) !== null

  const controls = (
    <View style={isTablet ? styles.controlsTablet : styles.controls}>
      <Pressable
        hitSlop={8}
        disabled={!canGoPrevious}
        onPress={playPreviousInQueue}
        accessibilityLabel="Previous in queue"
      >
        <SkipBack size={20} color={canGoPrevious ? colors.textSecondary : colors.textDisabled} />
      </Pressable>
      <Pressable hitSlop={8} style={styles.skipBtn} onPress={() => requestSeek(Math.max(0, currentTimeSec - skipBackSec))}>
        <RotateCcw size={24} color={colors.textSecondary} />
        <Text style={styles.skipLabel}>{skipBackSec}</Text>
      </Pressable>
      <Pressable
        style={[styles.playButton, isTablet && styles.playButtonTablet]}
        onPress={togglePlay}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
      >
        {playing ? (
          <Pause size={28} color="#fff" fill="#fff" />
        ) : (
          <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
        )}
      </Pressable>
      <Pressable
        hitSlop={8}
        style={styles.skipBtn}
        onPress={() => requestSeek(Math.min(duration, currentTimeSec + skipForwardSec))}
      >
        <RotateCw size={24} color={colors.textSecondary} />
        <Text style={styles.skipLabel}>{skipForwardSec}</Text>
      </Pressable>
      <Pressable hitSlop={8} disabled={!canGoNext} onPress={playNextInQueue} accessibilityLabel="Next in queue">
        <SkipForward size={20} color={canGoNext ? colors.textSecondary : colors.textDisabled} />
      </Pressable>
    </View>
  )

  // alignSelf: 'stretch' on the outer wrapper matters specifically for the
  // tablet layout below: its ScrollView content uses alignItems: 'center'
  // to center the artwork/title, which (without this) also shrinks this
  // whole block to its children's natural width — an empty bar/thumb View
  // and a row of two short Text nodes have almost no natural width, so the
  // track and the time labels' spacing both collapsed to nothing, leaving
  // only the absolutely-positioned thumb visible and the two times jammed
  // together. On phone this is a no-op (the container's default alignItems
  // is already 'stretch').
  const scrubber = (
    <View style={styles.scrubberBlock}>
      <View style={styles.barTouchArea} onLayout={onBarLayout} {...panHandlers}>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${progress * 100}%` }, scrubbing && styles.thumbActive]} />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(displayedTimeSec)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>
    </View>
  )

  const speedPill = (
    <Pressable style={styles.speedBtn} onPress={() => setPlaybackRate(nextSpeed(playbackRate))}>
      <Text style={styles.speedText}>{playbackRate}x</Text>
    </Pressable>
  )

  if (isTablet) {
    // Not a modal — it takes over the content area while the sidebar stays
    // visible (App.tsx renders Sidebar as a sibling, unaffected by this
    // route). Left column mirrors the phone layout at a larger scale; the
    // right rail (regular width only — hidden at rail/portrait per spec §6)
    // adds Up Next and full episode notes since there's room for them.
    return (
      <View style={styles.tabletContainer}>
        <Pressable style={styles.collapseBar} onPress={onBack} hitSlop={8}>
          <ChevronDown size={18} color={colors.textMuted} />
          <Text style={styles.collapseText}>Now Playing</Text>
        </Pressable>
        <View style={styles.tabletBody}>
          <ScrollView
            style={styles.tabletLeft}
            contentContainerStyle={styles.tabletLeftContent}
            showsVerticalScrollIndicator={false}
          >
            <Artwork url={episode.artworkUrl ?? podcast.artworkUrl} size={288} radius={radii.card} />
            <Text style={styles.podcastNameTablet}>{podcast.name}</Text>
            <Text style={styles.titleTablet} numberOfLines={3}>
              {episode.title}
            </Text>
            {scrubber}
            {controls}
            {speedPill}
            {mode === 'rail' && description.length > 0 && (
              <View style={styles.descriptionSection}>
                <Text style={styles.sectionTitle}>Episode Description</Text>
                <Text style={styles.description}>{description}</Text>
              </View>
            )}
          </ScrollView>
          {mode === 'regular' && (
            <ScrollView style={styles.tabletRight} contentContainerStyle={{ paddingBottom: 24 }}>
              {upNext.length > 0 && (
                <View style={styles.rightSection}>
                  <Text style={styles.sectionTitle}>Up Next</Text>
                  {upNext.map((item) => {
                    const itemPodcast = podcastById.get(item.podcastId)
                    return (
                      <Pressable
                        key={item.id}
                        style={styles.queueRow}
                        onPress={() => loadEpisode(item.id, { autoplay: true })}
                      >
                        <Artwork
                          url={item.artworkUrl ?? itemPodcast?.artworkUrl ?? null}
                          size={40}
                          radius={radii.artworkSm}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.queueTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.queueSub} numberOfLines={1}>
                            {itemPodcast?.name}
                          </Text>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              )}
              {description.length > 0 && (
                <View style={styles.rightSection}>
                  <Text style={styles.sectionTitle}>Episode Description</Text>
                  <Text style={styles.description}>{description}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Episodes'}</Text>
      </Pressable>

      <View style={styles.artworkWrap}>
        <Artwork url={episode.artworkUrl ?? podcast.artworkUrl} size={220} radius={16} />
      </View>

      <Text style={styles.podcastName}>{podcast.name}</Text>
      <Text style={styles.title} numberOfLines={2}>
        {episode.title}
      </Text>

      {scrubber}
      {controls}
      {speedPill}

      {description.length > 0 && (
        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Episode Description</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 40 },
  back: { color: colors.accent, marginBottom: 16, fontSize: 15 },
  artworkWrap: { alignItems: 'center', marginBottom: 20 },
  podcastName: { fontSize: 13, color: colors.textMuted, marginBottom: 4, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center', color: colors.textPrimary },
  scrubberBlock: { alignSelf: 'stretch' },
  barTouchArea: {
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 6
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e0e0e6',
    overflow: 'hidden'
  },
  barFill: { height: '100%', backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: '#fff'
  },
  thumbActive: { transform: [{ scale: 1.3 }] },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  timeText: { fontSize: 12, color: colors.textMuted },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginBottom: 16
  },
  skipBtn: { alignItems: 'center', width: 40 },
  skipLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginTop: 1 },
  playButton: {
    backgroundColor: colors.accent,
    borderRadius: 36,
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center'
  },
  speedBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#e8e8ed',
    borderRadius: radii.pill
  },
  speedText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  descriptionSection: { marginTop: 28 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPlaceholder,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8
  },
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  // iPad Now Playing pane — spec §6.
  tabletContainer: { flex: 1, backgroundColor: colors.surface },
  collapseBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12
  },
  collapseText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabletBody: { flex: 1, flexDirection: 'row' },
  tabletLeft: { flex: 1 },
  tabletLeftContent: { alignItems: 'center', paddingHorizontal: 32, paddingBottom: 40 },
  // Narrower than the spec's original 372pt — the main Now Playing content
  // (artwork/controls/scrubber) is what people actually look at while
  // something's playing, so it gets priority over the Up Next rail. Row
  // titles there already truncate to one line, so a tighter column just
  // means more truncation, not lost information.
  tabletRight: {
    width: 180,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
    padding: 14
  },
  podcastNameTablet: { fontSize: 14, color: colors.textMuted, marginTop: 20, textAlign: 'center' },
  titleTablet: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center',
    color: colors.textPrimary,
    maxWidth: 640
  },
  controlsTablet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginBottom: 20
  },
  playButtonTablet: { width: 88, height: 88, borderRadius: 44 },
  rightSection: { marginBottom: 28 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  queueTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  queueSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 }
})
