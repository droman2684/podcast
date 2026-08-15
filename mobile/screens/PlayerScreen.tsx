import { useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'

const SAVE_INTERVAL_MS = 5000

interface Props {
  episode: Episode
  podcast: Podcast
  onBack: () => void
}

export default function PlayerScreen({ episode, podcast, onBack }: Props): React.JSX.Element {
  const positions = useStore((s) => s.positions)
  const savePosition = useStore((s) => s.savePosition)
  const markPlayed = useStore((s) => s.markPlayed)

  const player = useAudioPlayer(episode.audioUrl)
  const status = useAudioPlayerStatus(player)
  const seeked = useRef(false)

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
    const interval = setInterval(() => {
      if (status.playing && status.currentTime > 0) {
        savePosition(episode.id, status.currentTime)
      }
    }, SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [status.playing, status.currentTime, episode.id, savePosition])

  useEffect(() => {
    if (status.didJustFinish) {
      savePosition(episode.id, 0)
      markPlayed(episode.id, podcast.id)
    }
  }, [status.didJustFinish, episode.id, podcast.id, savePosition, markPlayed])

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Episodes'}</Text>
      </Pressable>
      <Text style={styles.podcastName}>{podcast.name}</Text>
      <Text style={styles.title}>{episode.title}</Text>
      <Text style={styles.time}>
        {Math.floor(status.currentTime)}s / {Math.floor(status.duration)}s
      </Text>
      <Pressable
        style={styles.playButton}
        onPress={() => (status.playing ? player.pause() : player.play())}
      >
        <Text style={styles.playButtonText}>{status.playing ? 'Pause' : 'Play'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 24 },
  back: { color: '#FF5910', marginBottom: 20, fontSize: 15 },
  podcastName: { fontSize: 13, color: '#888', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  time: { fontSize: 14, color: '#888', marginBottom: 20 },
  playButton: {
    backgroundColor: '#FF5910',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center'
  },
  playButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 }
})
