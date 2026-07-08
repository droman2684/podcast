import { useEffect, useRef } from 'react'
import { useAppStore } from '@renderer/state/store'
import type { Episode } from '@renderer/types'

const SAVE_POSITION_INTERVAL_MS = 5000

function findEpisode(episodesByPodcast: Record<string, Episode[]>, id: string): Episode | null {
  for (const episodes of Object.values(episodesByPodcast)) {
    const found = episodes.find((e) => e.id === id)
    if (found) return found
  }
  return null
}

export function useAudioEngine(): React.RefObject<HTMLAudioElement | null> {
  const audioRef = useRef<HTMLAudioElement>(null)
  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const playing = useAppStore((s) => s.playing)
  const speed = useAppStore((s) => s.speed)
  const volume = useAppStore((s) => s.volume)
  const seekToSec = useAppStore((s) => s.seekToSec)

  // Load a new source whenever the current episode changes.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentEpisodeId) return

    const state = useAppStore.getState()
    const episode = findEpisode(state.episodesByPodcast, currentEpisodeId)
    if (!episode) return

    audio.src = episode.audioUrl
    audio.load()

    window.api.playback.getPosition(currentEpisodeId).then((pos) => {
      if (audio.src && pos > 0) audio.currentTime = pos
    })
  }, [currentEpisodeId])

  // Sync play/pause state.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentEpisodeId) return
    if (playing) {
      audio.play().catch((err) => console.error('Playback failed:', err))
    } else {
      audio.pause()
    }
  }, [playing, currentEpisodeId])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  // Apply seek requests coming from the UI (progress bar clicks, skip buttons).
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || seekToSec === null) return
    audio.currentTime = seekToSec
    useAppStore.getState().clearSeekRequest()
  }, [seekToSec])

  // Wire native audio events back into the store.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = (): void => useAppStore.getState().setCurrentTime(audio.currentTime)
    const onLoadedMetadata = (): void => useAppStore.getState().setDuration(audio.duration || 0)
    const onEnded = (): void => {
      const state = useAppStore.getState()
      if (state.currentEpisodeId) {
        state.markEpisodePlayed(state.currentEpisodeId, true)
        window.api.playback.savePosition(state.currentEpisodeId, 0)
        state.setPositionLocal(state.currentEpisodeId, 0)
        // Only a fully-finished episode is auto-removed from the queue — playing
        // one (including out of order) never removes it on its own.
        state.removeFromQueue(state.currentEpisodeId)
      }
      state.playNext()
    }
    const onError = (): void => console.error('Audio element error:', audio.error)

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [])

  // Periodically persist playback position for resume-after-restart.
  useEffect(() => {
    const interval = setInterval(() => {
      const state = useAppStore.getState()
      if (state.currentEpisodeId && state.playing) {
        window.api.playback.savePosition(state.currentEpisodeId, state.currentTimeSec)
        state.setPositionLocal(state.currentEpisodeId, state.currentTimeSec)
      }
    }, SAVE_POSITION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return audioRef
}
