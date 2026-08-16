import { useEffect, useRef } from 'react'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'
import type { Episode } from '@shared/types'
import { useStore } from '../state/store'
import { removeFromQueueOnFinish } from '../lib/queueHelpers'

const SAVE_INTERVAL_MS = 5000

function findEpisode(episodesByPodcast: Record<string, Episode[]>, id: string): Episode | null {
  for (const episodes of Object.values(episodesByPodcast)) {
    const found = episodes.find((e) => e.id === id)
    if (found) return found
  }
  return null
}

// One persistent player for the whole app, mounted once here rather than
// inside PlayerScreen — mirrors the desktop app's useAudioEngine.ts pattern.
// Without this, navigating away from the Player screen (e.g. to check the
// Home tab) would unmount whatever owned the player and stop playback, and
// Home/Queue would have no way to show or control what's currently playing.
export default function AudioEngine(): null {
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const seekRequestSec = useStore((s) => s.seekRequestSec)
  const playbackRate = useStore((s) => s.playbackRate)
  const positions = useStore((s) => s.positions)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const podcasts = useStore((s) => s.podcasts)
  const queue = useStore((s) => s.queue)
  const savePosition = useStore((s) => s.savePosition)
  const setPlayed = useStore((s) => s.setPlayed)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const clearSeekRequest = useStore((s) => s.clearSeekRequest)
  const setPlaybackTime = useStore((s) => s.setPlaybackTime)
  const loadEpisode = useStore((s) => s.loadEpisode)

  const episode = currentEpisodeId ? findEpisode(episodesByPodcast, currentEpisodeId) : null
  const podcast = episode ? podcasts.find((p) => p.id === episode.podcastId) : null

  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const loadedEpisodeId = useRef<string | null>(null)
  const seededPositionFor = useRef<string | null>(null)
  const finishedFor = useRef<string | null>(null)

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {})
  }, [])

  // useAudioPlayer's source argument is only read on the player's initial
  // creation — later changes must go through player.replace(), which is
  // exactly what a persistent single player needs anyway.
  useEffect(() => {
    if (!episode || loadedEpisodeId.current === episode.id) return
    loadedEpisodeId.current = episode.id
    player.replace(episode.audioUrl)
  }, [episode?.id, episode?.audioUrl, player])

  useEffect(() => {
    if (!status.isLoaded || !episode || seededPositionFor.current === episode.id) return
    const saved = positions[episode.id] ?? 0
    if (saved > 0) player.seekTo(saved)
    seededPositionFor.current = episode.id
  }, [status.isLoaded, episode?.id, player, positions])

  useEffect(() => {
    if (playing) player.play()
    else player.pause()
  }, [playing, episode?.id, player])

  useEffect(() => {
    player.setPlaybackRate(playbackRate)
  }, [playbackRate, episode?.id, player])

  useEffect(() => {
    if (seekRequestSec === null) return
    player.seekTo(seekRequestSec)
    clearSeekRequest()
  }, [seekRequestSec, player, clearSeekRequest])

  useEffect(() => {
    setPlaybackTime(status.currentTime, status.duration)
  }, [status.currentTime, status.duration, setPlaybackTime])

  useEffect(() => {
    if (!episode) return
    try {
      player.setActiveForLockScreen(
        true,
        {
          title: episode.title,
          artist: podcast?.name,
          artworkUrl: episode.artworkUrl ?? podcast?.artworkUrl ?? undefined
        },
        { showSeekBackward: true, showSeekForward: true }
      )
    } catch {
      // Lock-screen metadata is a nice-to-have — playback itself doesn't
      // depend on it.
    }
  }, [status.isLoaded, episode?.id, episode?.title, episode?.artworkUrl, podcast?.name, podcast?.artworkUrl, player])

  useEffect(() => {
    const interval = setInterval(() => {
      if (playing && episode && status.currentTime > 0) savePosition(episode.id, status.currentTime)
    }, SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [playing, episode, status.currentTime, savePosition])

  useEffect(() => {
    if (!status.didJustFinish || !episode || finishedFor.current === episode.id) return
    finishedFor.current = episode.id
    savePosition(episode.id, 0)
    setPlayed(episode.id, episode.podcastId, true)
    const nextId = removeFromQueueOnFinish(queue, episode.id, removeFromQueue)
    if (nextId) loadEpisode(nextId, { autoplay: true })
  }, [status.didJustFinish, episode, queue, savePosition, setPlayed, removeFromQueue, loadEpisode])

  return null
}
