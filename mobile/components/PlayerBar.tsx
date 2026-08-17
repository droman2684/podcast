import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Play, Pause, ChevronUp } from 'lucide-react-native'
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

interface Props {
  onOpen: (podcastId: string, episodeId: string) => void
}

// The iPad equivalent of MiniPlayer (spec §6 "Player bar") — persistent
// across the whole content column, but with real inline transport controls
// and a scrubber instead of just a progress sliver, since there's the width
// to spare. Tapping the artwork/title or the expand chevron opens the same
// Now Playing pane MiniPlayer's tap opens on phone (PlayerScreen in its
// `mode="rail"/"regular"` layout — see App.tsx).
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

  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])
  const episode = currentEpisodeId ? episodeIndex.get(currentEpisodeId) : undefined
  const podcast = episode ? podcasts.find((p) => p.id === episode.podcastId) : undefined

  const { onBarLayout, panHandlers, progress, scrubbing } = useScrubBar({
    duration,
    currentTimeSec,
    onSeek: requestSeek
  })

  if (!episode || !podcast) return null

  return (
    <View style={styles.bar}>
      <Pressable style={styles.identity} onPress={() => onOpen(podcast.id, episode.id)}>
        <Artwork url={episode.artworkUrl ?? podcast.artworkUrl} size={52} radius={radii.artworkSm} />
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
        <Pressable onPress={() => requestSeek(Math.max(0, currentTimeSec - skipBackSec))}>
          <Text style={styles.skipText}>-{skipBackSec}s</Text>
        </Pressable>
        <Pressable
          style={styles.playBtn}
          onPress={togglePlay}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={22} color="#fff" fill="#fff" /> : <Play size={22} color="#fff" fill="#fff" />}
        </Pressable>
        <Pressable onPress={() => requestSeek(Math.min(duration, currentTimeSec + skipForwardSec))}>
          <Text style={styles.skipText}>+{skipForwardSec}s</Text>
        </Pressable>
      </View>

      <View style={styles.scrubWrap} onLayout={onBarLayout} {...panHandlers}>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${progress * 100}%` }, scrubbing && styles.thumbActive]} />
      </View>

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
  )
}

const styles = StyleSheet.create({
  bar: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, width: 290 },
  title: { fontSize: 13.5, fontWeight: '600', color: colors.textPrimary },
  podcastName: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },

  transport: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  skipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, width: 30, textAlign: 'center' },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },

  scrubWrap: { flex: 1, justifyContent: 'center', height: 24 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e0e0e6', overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: colors.accent },
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

  speedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#e8e8ed',
    borderRadius: radii.pill
  },
  speedText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  expandBtn: { padding: 4 }
})
