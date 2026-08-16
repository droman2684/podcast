import { useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, PanResponder, StyleSheet, type LayoutChangeEvent } from 'react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { stripHtml } from '../lib/stripHtml'
import { colors, radii } from '../theme'

const SPEEDS = [1, 1.25, 1.5, 1.75, 2]
const THUMB_SIZE = 16

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
  const skipBackSec = useStore((s) => s.skipBackSec)
  const skipForwardSec = useStore((s) => s.skipForwardSec)
  const togglePlay = useStore((s) => s.togglePlay)
  const requestSeek = useStore((s) => s.requestSeek)
  const setPlaybackRate = useStore((s) => s.setPlaybackRate)
  const [barWidth, setBarWidth] = useState(0)
  // null when not actively dragging the seek thumb; a 0-1 ratio while dragging,
  // so the bar tracks the finger instead of the (stale, until seek completes)
  // playback position.
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)

  // PanResponder is created once via useRef — its callbacks close over whatever
  // barWidth/duration were at creation time, so live values are read through
  // refs instead (same pattern as DraggableList.tsx's latestRef).
  const barWidthRef = useRef(barWidth)
  barWidthRef.current = barWidth
  const durationRef = useRef(duration)
  durationRef.current = duration
  const dragStartXRef = useRef(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        dragStartXRef.current = evt.nativeEvent.locationX
        const width = barWidthRef.current
        const ratio = width > 0 ? Math.min(1, Math.max(0, evt.nativeEvent.locationX / width)) : 0
        setScrubRatio(ratio)
      },
      onPanResponderMove: (_evt, gesture) => {
        const width = barWidthRef.current
        if (width <= 0) return
        const x = dragStartXRef.current + gesture.dx
        setScrubRatio(Math.min(1, Math.max(0, x / width)))
      },
      onPanResponderRelease: () => {
        setScrubRatio((ratio) => {
          if (ratio !== null && durationRef.current > 0) requestSeek(ratio * durationRef.current)
          return null
        })
      },
      onPanResponderTerminate: () => setScrubRatio(null)
    })
  ).current

  const progress = scrubRatio !== null ? scrubRatio : duration > 0 ? currentTimeSec / duration : 0
  const displayedTimeSec = scrubRatio !== null ? scrubRatio * duration : currentTimeSec
  const description = stripHtml(episode.description)

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

      <View
        style={styles.barTouchArea}
        onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            { left: `${progress * 100}%` },
            scrubRatio !== null && styles.thumbActive
          ]}
        />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(displayedTimeSec)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => requestSeek(Math.max(0, currentTimeSec - skipBackSec))}>
          <Text style={styles.skipBtn}>-{skipBackSec}s</Text>
        </Pressable>
        <Pressable style={styles.playButton} onPress={togglePlay}>
          <Text style={styles.playButtonText}>{playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={() => requestSeek(Math.min(duration, currentTimeSec + skipForwardSec))}>
          <Text style={styles.skipBtn}>+{skipForwardSec}s</Text>
        </Pressable>
      </View>

      <Pressable style={styles.speedBtn} onPress={() => setPlaybackRate(nextSpeed(playbackRate))}>
        <Text style={styles.speedText}>{playbackRate}x</Text>
      </Pressable>

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
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.accent,
    marginLeft: -THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: '#fff'
  },
  thumbActive: { transform: [{ scale: 1.3 }] },
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
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 }
})
