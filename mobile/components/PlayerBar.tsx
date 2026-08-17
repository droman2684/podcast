import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Play, Pause, ChevronUp, RotateCcw, RotateCw, SkipBack, SkipForward } from 'lucide-react-native'
import { nextInQueue, previousInQueue } from '@shared/queueView'
import { useStore } from '../state/store'
import { buildEpisodeIndex } from '../lib/episodeIndex'
import { useScrubBar } from '../lib/useScrubBar'
import Artwork from './Artwork'
import { colors, radii } from '../theme'

function nextSpeed(current: number): number {
  const SPEEDS = [1, 1.25, 1.5, 1.75, 2]
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
  onOpen: (podcastId: string, episodeId: string) => void
}

// The iPad equivalent of MiniPlayer (spec §6 "Player bar") — persistent
// across the whole content column, but with real inline transport controls
// and a scrubber instead of just a progress sliver, since there's the width
// to spare. Tapping the artwork/title or the expand chevron opens the same
// Now Playing pane MiniPlayer's tap opens on phone (PlayerScreen in its
// `mode="rail"/"regular"` layout — see App.tsx).
//
// Two stacked rows rather than one wide row: an earlier version packed
// identity + transport + scrubber + speed into a single row with the
// scrubber as the only flexible element, and identity's fixed 290pt width
// alone was enough to squeeze the scrubber to zero width on anything
// narrower than a full-screen regular-width iPad (Split View, `rail`/
// portrait, a smaller iPad) — only the absolutely-positioned thumb still
// rendered, which read as "just a dot" with no visible track. A full-width
// top row for the scrubber can't be squeezed by anything below it.
export default function PlayerBar({ onOpen }: Props): React.JSX.Element | null {
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const duration = useStore((s) => s.duration)
  const playbackRate = useStore((s) => s.playbackRate)
  const skipBackSec = useStore((s) => s.skipBackSec)
  const skipForwardSec = useStore((s) => s.skipForwardSec)
  const togglePlay = useStore((s) => s.togglePlay)
  const requestSeek = useStore((s) => s.requestSeek)
  const setPlaybackRate = useStore((s) => s.setPlaybackRate)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const queue = useStore((s) => s.queue)
  const playNextInQueue = useStore((s) => s.playNextInQueue)
  const playPreviousInQueue = useStore((s) => s.playPreviousInQueue)

  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])
  const episode = currentEpisodeId ? episodeIndex.get(currentEpisodeId) : undefined
  const podcast = episode ? podcasts.find((p) => p.id === episode.podcastId) : undefined
  const canGoPrevious = previousInQueue(queue, currentEpisodeId) !== null
  const canGoNext = nextInQueue(queue, currentEpisodeId) !== null

  const { onBarLayout, panHandlers, progress, displayedTimeSec, scrubbing } = useScrubBar({
    duration,
    currentTimeSec,
    onSeek: requestSeek
  })

  if (!episode || !podcast) return null

  return (
    <View style={styles.bar}>
      <View style={styles.scrubRow}>
        <Text style={styles.timeText} numberOfLines={1}>
          {formatTime(displayedTimeSec)}
        </Text>
        <View style={styles.scrubWrap} onLayout={onBarLayout} {...panHandlers}>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { left: `${progress * 100}%` }, scrubbing && styles.thumbActive]} />
        </View>
        <Text style={styles.timeText} numberOfLines={1}>
          {formatTime(duration)}
        </Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable style={styles.identity} onPress={() => onOpen(podcast.id, episode.id)}>
          <Artwork url={episode.artworkUrl ?? podcast.artworkUrl} size={48} radius={radii.artworkSm} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>
              {episode.title}
            </Text>
            <Text style={styles.podcastName} numberOfLines={1}>
              {podcast.name}
            </Text>
          </View>
        </Pressable>

        <View style={styles.transport}>
          <Pressable
            hitSlop={8}
            disabled={!canGoPrevious}
            onPress={playPreviousInQueue}
            accessibilityLabel="Previous in queue"
          >
            <SkipBack size={18} color={canGoPrevious ? colors.textSecondary : colors.textDisabled} />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={styles.skipBtn}
            onPress={() => requestSeek(Math.max(0, currentTimeSec - skipBackSec))}
          >
            <RotateCcw size={22} color={colors.textSecondary} />
            <Text style={styles.skipLabel}>{skipBackSec}</Text>
          </Pressable>
          <Pressable
            style={styles.playBtn}
            onPress={togglePlay}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={24} color="#fff" fill="#fff" /> : <Play size={24} color="#fff" fill="#fff" />}
          </Pressable>
          <Pressable
            hitSlop={8}
            style={styles.skipBtn}
            onPress={() => requestSeek(Math.min(duration, currentTimeSec + skipForwardSec))}
          >
            <RotateCw size={22} color={colors.textSecondary} />
            <Text style={styles.skipLabel}>{skipForwardSec}</Text>
          </Pressable>
          <Pressable hitSlop={8} disabled={!canGoNext} onPress={playNextInQueue} accessibilityLabel="Next in queue">
            <SkipForward size={18} color={canGoNext ? colors.textSecondary : colors.textDisabled} />
          </Pressable>
        </View>

        <View style={styles.rightControls}>
          <Pressable style={styles.speedBtn} onPress={() => setPlaybackRate(nextSpeed(playbackRate))}>
            <Text style={styles.speedText}>{playbackRate}x</Text>
          </Pressable>
          <Pressable
            style={styles.expandBtn}
            onPress={() => onOpen(podcast.id, episode.id)}
            accessibilityLabel="Expand Now Playing"
          >
            <ChevronUp size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },

  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeText: { fontSize: 11.5, color: colors.textMuted, width: 48, textAlign: 'center' },
  scrubWrap: { flex: 1, justifyContent: 'center', height: 24 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#e0e0e6', overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    marginLeft: -9,
    borderWidth: 2,
    borderColor: '#fff'
  },
  thumbActive: { transform: [{ scale: 1.3 }] },

  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 13.5, fontWeight: '600', color: colors.textPrimary },
  podcastName: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },

  transport: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  skipBtn: { alignItems: 'center', width: 34 },
  skipLabel: { fontSize: 9.5, fontWeight: '700', color: colors.textSecondary, marginTop: 1 },
  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },

  rightControls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 },
  speedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#e8e8ed',
    borderRadius: radii.pill
  },
  speedText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  expandBtn: { padding: 4 }
})
