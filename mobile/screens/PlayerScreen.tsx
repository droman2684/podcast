import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import { removeFromQueueOnFinish } from '../lib/queueHelpers'
import Artwork from '../components/Artwork'
import { colors, radii } from '../theme'

const SAVE_INTERVAL_MS = 5000
const SKIP_SEC = 15
const SPEEDS = [1, 1.25, 1.5, 1.75, 2]

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
  onAdvance: (episodeId: string) => void
}

export default function PlayerScreen({ episode, podcast, onBack, onAdvance }: Props): React.JSX.Element {
  const positions = useStore((s) => s.positions)
  const queue = useStore((s) => s.queue)
  const savePosition = useStore((s) => s.savePosition)
  const setPlayed = useStore((s) => s.setPlayed)
  const removeFromQueue = useStore((s) => s.removeFromQueue)

  const player = useAudioPlayer(episode.audioUrl)
  const status = useAudioPlayerStatus(player)
  const seeked = useRef(false)
  const finished = useRef(false)
  const [speedIndex, setSpeedIndex] = useState(0)
  const [barWidth, setBarWidth] = useState(0)

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {})
  }, [])

  // Resume from the saved position once the player has actually loaded the
  // source — seeking before that silently no-ops.
  useEffect(() => {
    if (seeked.current || !status.isLoaded) return
    const saved = positions[episode.id] ?? 0
    if (saved > 0) player.seekTo(saved)
    seeked.current = true
  }, [status.isLoaded, episode.id, player, positions])

  useEffect(() => {
    if (!status.isLoaded) return
    try {
      player.setActiveForLockScreen(
        true,
        {
          title: episode.title,
          artist: podcast.name,
          artworkUrl: episode.artworkUrl ?? podcast.artworkUrl ?? undefined
        },
        { showSeekBackward: true, showSeekForward: true }
      )
    } catch {
      // Lock-screen metadata is a nice-to-have — playback itself doesn't
      // depend on it, so a failure here shouldn't surface as an error.
    }
  }, [status.isLoaded, episode.id, episode.title, episode.artworkUrl, podcast.name, podcast.artworkUrl, player])

  useEffect(() => {
    const interval = setInterval(() => {
      if (status.playing && status.currentTime > 0) {
        savePosition(episode.id, status.currentTime)
      }
    }, SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [status.playing, status.currentTime, episode.id, savePosition])

  useEffect(() => {
    if (!status.didJustFinish || finished.current) return
    finished.current = true
    savePosition(episode.id, 0)
    setPlayed(episode.id, podcast.id, true)
    const nextId = removeFromQueueOnFinish(queue, episode.id, removeFromQueue)
    if (nextId) onAdvance(nextId)
  }, [status.didJustFinish, episode.id, podcast.id, queue, savePosition, setPlayed, removeFromQueue, onAdvance])

  const seekByBarTap = (x: number): void => {
    if (barWidth <= 0 || status.duration <= 0) return
    const ratio = Math.min(1, Math.max(0, x / barWidth))
    player.seekTo(ratio * status.duration)
  }

  const cycleSpeed = (): void => {
    const next = (speedIndex + 1) % SPEEDS.length
    setSpeedIndex(next)
    player.playbackRate = SPEEDS[next]
  }

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0

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
        <Text style={styles.timeText}>{formatTime(status.currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(status.duration)}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable onPress={() => player.seekTo(Math.max(0, status.currentTime - SKIP_SEC))}>
          <Text style={styles.skipBtn}>-15s</Text>
        </Pressable>
        <Pressable
          style={styles.playButton}
          onPress={() => (status.playing ? player.pause() : player.play())}
        >
          <Text style={styles.playButtonText}>{status.playing ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={() => player.seekTo(Math.min(status.duration, status.currentTime + SKIP_SEC))}>
          <Text style={styles.skipBtn}>+15s</Text>
        </Pressable>
      </View>

      <Pressable style={styles.speedBtn} onPress={cycleSpeed}>
        <Text style={styles.speedText}>{SPEEDS[speedIndex]}x</Text>
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
