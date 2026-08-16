import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { colors, radii } from '../theme'

const SKIP_SEC = 15
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
}

// A thin view onto the global AudioEngine (components/AudioEngine.tsx) —
// this screen no longer owns a player instance, so navigating away doesn't
// stop playback and Home/Queue see the same live state.
export default function PlayerScreen({ episode, podcast, onBack }: Props): React.JSX.Element {
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const duration = useStore((s) => s.duration)
  const playbackRate = useStore((s) => s.playbackRate)
  const togglePlay = useStore((s) => s.togglePlay)
  const requestSeek = useStore((s) => s.requestSeek)
  const setPlaybackRate = useStore((s) => s.setPlaybackRate)
  const [barWidth, setBarWidth] = useState(0)

  const seekByBarTap = (x: number): void => {
    if (barWidth <= 0 || duration <= 0) return
    const ratio = Math.min(1, Math.max(0, x / barWidth))
    requestSeek(ratio * duration)
  }

  const progress = duration > 0 ? currentTimeSec / duration : 0

  return (
    <View style={styles.container}>
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

      <Pressable
        style={styles.bar}
        onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => seekByBarTap(e.nativeEvent.locationX)}
      >
        <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
      </Pressable>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(currentTimeSec)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => requestSeek(Math.max(0, currentTimeSec - SKIP_SEC))}>
          <Text style={styles.skipBtn}>-15s</Text>
        </Pressable>
        <Pressable style={styles.playButton} onPress={togglePlay}>
          <Text style={styles.playButtonText}>{playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={() => requestSeek(Math.min(duration, currentTimeSec + SKIP_SEC))}>
          <Text style={styles.skipBtn}>+15s</Text>
        </Pressable>
      </View>

      <Pressable style={styles.speedBtn} onPress={() => setPlaybackRate(nextSpeed(playbackRate))}>
        <Text style={styles.speedText}>{playbackRate}x</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 24 },
  back: { color: colors.accent, marginBottom: 16, fontSize: 15 },
  artworkWrap: { alignItems: 'center', marginBottom: 20 },
  podcastName: { fontSize: 13, color: colors.textMuted, marginBottom: 4, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center', color: colors.textPrimary },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e0e0e6',
    overflow: 'hidden',
    marginBottom: 6
  },
  barFill: { height: '100%', backgroundColor: colors.accent },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  timeText: { fontSize: 12, color: colors.textMuted },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  skipBtn: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, width: 60, textAlign: 'center' },
  playButton: {
    backgroundColor: colors.accent,
    borderRadius: 36,
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center'
  },
  playButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  speedBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#e8e8ed',
    borderRadius: radii.pill
  },
  speedText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary }
})
