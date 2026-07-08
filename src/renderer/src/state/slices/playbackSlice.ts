import type { StateCreator } from 'zustand'
import type { Speed } from '@renderer/types'
import { nextInQueue, previousInQueue } from '@shared/queueView'
import type { AppState } from '../store'

const SPEEDS: Speed[] = [1.0, 1.5, 2.0, 0.75]

export interface PlaybackSlice {
  currentEpisodeId: string | null
  playing: boolean
  currentTimeSec: number
  durationSec: number
  speed: Speed
  volume: number
  seekToSec: number | null
  nowPlayingExpanded: boolean
  positions: Record<string, number> // episodeId -> last saved position, seconds

  loadEpisode: (episodeId: string, opts?: { autoplay?: boolean }) => void
  togglePlay: () => void
  seek: (sec: number) => void
  clearSeekRequest: () => void
  setCurrentTime: (sec: number) => void
  setDuration: (sec: number) => void
  cycleSpeed: () => void
  setVolume: (v: number) => void
  playNext: () => void
  playFromQueue: (episodeId: string) => void
  playNextInQueue: () => void
  playPreviousInQueue: () => void
  openNowPlayingExpanded: () => void
  closeNowPlayingExpanded: () => void
  loadPositions: () => Promise<void>
  setPositionLocal: (episodeId: string, positionSec: number) => void
}

export const createPlaybackSlice: StateCreator<AppState, [], [], PlaybackSlice> = (set, get) => ({
  currentEpisodeId: null,
  playing: false,
  currentTimeSec: 0,
  durationSec: 0,
  speed: 1.0,
  volume: 1,
  seekToSec: null,
  nowPlayingExpanded: false,
  positions: {},

  loadEpisode: (episodeId, opts) =>
    set({
      currentEpisodeId: episodeId,
      currentTimeSec: 0,
      durationSec: 0,
      playing: opts?.autoplay ?? true
    }),

  togglePlay: () =>
    set((state) => {
      if (!state.currentEpisodeId) return state
      return { playing: !state.playing }
    }),

  seek: (sec) => set({ seekToSec: sec }),
  clearSeekRequest: () => set({ seekToSec: null }),
  setCurrentTime: (sec) => set({ currentTimeSec: sec }),
  setDuration: (sec) => set({ durationSec: sec }),

  cycleSpeed: () => {
    const idx = SPEEDS.indexOf(get().speed)
    set({ speed: SPEEDS[(idx + 1) % SPEEDS.length] })
  },
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),

  // Called by useAudioEngine's `ended` handler once the just-finished episode
  // has already been removed from the queue — so queue[0] here is already
  // "the next thing up." This must NOT also remove that episode: it hasn't
  // played at all yet, and only leaves the queue when it's manually removed
  // or *it* finishes naturally, same as every other episode.
  playNext: () => {
    const { queue } = get()
    if (queue.length === 0) {
      set({ playing: false })
      return
    }
    get().loadEpisode(queue[0], { autoplay: true })
  },

  // Playing an episode from the queue does not remove it — an episode only
  // leaves the queue when the user removes it manually or it finishes
  // playing all the way through (see the `ended` handler in useAudioEngine).
  playFromQueue: (episodeId) => {
    get().loadEpisode(episodeId, { autoplay: true })
  },

  // Manual track-skip within the queue — purely positional, never mutates
  // the queue (unlike playNext(), which is the auto-advance-on-completion
  // path and does consume the front of the queue).
  playNextInQueue: () => {
    const { queue, currentEpisodeId } = get()
    const targetId = nextInQueue(queue, currentEpisodeId)
    if (targetId) get().loadEpisode(targetId, { autoplay: true })
  },
  playPreviousInQueue: () => {
    const { queue, currentEpisodeId } = get()
    const targetId = previousInQueue(queue, currentEpisodeId)
    if (targetId) get().loadEpisode(targetId, { autoplay: true })
  },

  openNowPlayingExpanded: () =>
    set((state) => (state.currentEpisodeId ? { nowPlayingExpanded: true } : state)),
  closeNowPlayingExpanded: () => set({ nowPlayingExpanded: false }),

  loadPositions: async () => {
    const positions = await window.api.playback.getAllPositions()
    set({ positions })
  },
  // Mirrors a position save into local state immediately, rather than
  // waiting for the next full reload — otherwise the in-progress indicator
  // on episode rows would lag behind actual playback by up to a save cycle.
  setPositionLocal: (episodeId, positionSec) =>
    set((state) => ({ positions: { ...state.positions, [episodeId]: positionSec } }))
})
