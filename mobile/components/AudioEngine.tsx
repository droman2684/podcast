import { useEffect, useMemo, useRef } from 'react'
import { AppState } from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, type AudioSource } from 'expo-audio'
import { useStore } from '../state/store'
import { removeFromQueueOnFinish } from '../lib/queueHelpers'
import { buildEpisodeIndex } from '../lib/episodeIndex'
import { getPrivateFeedCredential, basicAuthHeader } from '../lib/privateFeedCredentials'

const SAVE_INTERVAL_MS = 5000

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
  const downloadedUris = useStore((s) => s.downloadedUris)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const podcasts = useStore((s) => s.podcasts)
  const queue = useStore((s) => s.queue)
  const savePosition = useStore((s) => s.savePosition)
  const fetchLatestPosition = useStore((s) => s.fetchLatestPosition)
  const setPlayed = useStore((s) => s.setPlayed)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const clearSeekRequest = useStore((s) => s.clearSeekRequest)
  const setPlaybackTime = useStore((s) => s.setPlaybackTime)
  const loadEpisode = useStore((s) => s.loadEpisode)

  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])
  const episode = currentEpisodeId ? (episodeIndex.get(currentEpisodeId) ?? null) : null
  const podcast = episode ? podcasts.find((p) => p.id === episode.podcastId) : null

  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const loadedEpisodeId = useRef<string | null>(null)
  const seededPositionFor = useRef<string | null>(null)
  const finishedFor = useRef<string | null>(null)

  // Kept in a ref (rather than read from `status.currentTime` directly)
  // so the effects below can flush the current position on demand —
  // pause, episode switch, app backgrounding — without depending on
  // status.currentTime itself, which ticks on every playback frame and
  // would otherwise tear down/rebuild those effects continuously.
  const currentTimeRef = useRef(0)
  useEffect(() => {
    currentTimeRef.current = status.currentTime
  }, [status.currentTime])

  // Writes whatever's currently loaded straight to savePosition rather than
  // waiting for the next periodic tick — used wherever waiting risks losing
  // progress the app never gets another chance to save (pausing, switching
  // episodes, and the app backgrounding, which is the closest mobile
  // equivalent of Electron's before-quit: there's no reliable hook for
  // actual termination, but background always fires first). Kept in a ref
  // so effects with narrow dependency arrays can call the latest version
  // without needing it in their deps.
  const flushPositionRef = useRef<() => void>(() => {})
  flushPositionRef.current = () => {
    const id = loadedEpisodeId.current
    const t = currentTimeRef.current
    if (id && t > 0) savePosition(id, t)
  }

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {})
  }, [])

  // useAudioPlayer's source argument is only read on the player's initial
  // creation — later changes must go through player.replace(), which is
  // exactly what a persistent single player needs anyway. Prefers the
  // downloaded local file over the network URL when one exists, so a
  // downloaded episode plays offline instead of streaming. A downloaded
  // file needs no auth (it's already local); a private feed streamed
  // directly does, via the same Basic-auth credential used to fetch its
  // RSS — expo-audio's source object accepts per-request headers, so no
  // network-layer interception (which desktop needs, lacking that) is
  // required here.
  useEffect(() => {
    if (!episode || loadedEpisodeId.current === episode.id) return
    // Flush whatever episode was just playing before loadedEpisodeId moves
    // on — otherwise switching mid-episode (Next in Queue, picking another
    // show) can lose however many seconds it's been since the last
    // periodic save.
    flushPositionRef.current()
    loadedEpisodeId.current = episode.id
    const downloadedUri = downloadedUris[episode.id]
    if (downloadedUri) {
      player.replace(downloadedUri)
      return
    }
    if (!podcast?.isPrivate) {
      player.replace(episode.audioUrl)
      return
    }
    getPrivateFeedCredential(podcast.id).then((credential) => {
      // Bail if a different episode loaded while this lookup was in flight.
      if (loadedEpisodeId.current !== episode.id) return
      const source: AudioSource = credential
        ? { uri: episode.audioUrl, headers: { Authorization: basicAuthHeader(credential.user, credential.password) } }
        : episode.audioUrl
      player.replace(source)
    })
  }, [episode?.id, episode?.audioUrl, downloadedUris, podcast?.isPrivate, podcast?.id, player])

  // Fetches this episode's position fresh from Supabase rather than trusting
  // the local `positions` cache, which reflects whatever this device last
  // synced — possibly stale if listening happened on another device since.
  // Falls back to the local value only if the fetch fails (e.g. offline).
  useEffect(() => {
    if (!status.isLoaded || !episode || seededPositionFor.current === episode.id) return
    seededPositionFor.current = episode.id
    let cancelled = false
    const episodeId = episode.id
    fetchLatestPosition(episodeId).then((remoteSec) => {
      if (cancelled || loadedEpisodeId.current !== episodeId) return
      const saved = remoteSec ?? positions[episodeId] ?? 0
      if (saved > 0) player.seekTo(saved)
    })
    return () => {
      cancelled = true
    }
  }, [status.isLoaded, episode?.id, player, fetchLatestPosition])

  useEffect(() => {
    if (playing) player.play()
    else player.pause()
  }, [playing, episode?.id, player])

  // Flushes on every playing -> paused transition, keyed only on `playing`
  // itself (not episode?.id) so this doesn't also fire — using the wrong
  // episode's stale currentTimeRef — on the render where an episode switch
  // and a `playing` value that happens to already be false land together.
  const wasPlayingRef = useRef(false)
  useEffect(() => {
    if (wasPlayingRef.current && !playing) flushPositionRef.current()
    wasPlayingRef.current = playing
  }, [playing])

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
    } catch (err) {
      // Lock-screen metadata is a nice-to-have — playback itself doesn't
      // depend on it — but log rather than silently swallow, since a
      // silent failure here is indistinguishable from "it just doesn't
      // show controls."
      console.error('[lockscreen] setActiveForLockScreen failed:', err)
    }
  }, [status.isLoaded, episode?.id, episode?.title, episode?.artworkUrl, podcast?.name, podcast?.artworkUrl, player])

  // Depends only on `playing` and episode?.id — NOT status.currentTime or
  // the `episode` object. Both of those change on essentially every
  // playback frame (status.currentTime ticks continuously while playing;
  // `episode` is freshly derived from episodeIndex.get() every render, a
  // new object each time even for the same episode), so including either
  // used to tear this interval down and rebuild it before 5s ever elapsed —
  // the callback was created over and over but never actually survived
  // long enough to fire, so positions were never saved during normal
  // playback. flushPositionRef reads the current episode/time at call time,
  // so the interval doesn't need either as a dependency to stay accurate.
  useEffect(() => {
    const interval = setInterval(() => {
      if (playing) flushPositionRef.current()
    }, SAVE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [playing, episode?.id])

  useEffect(() => {
    if (!status.didJustFinish || !episode || finishedFor.current === episode.id) return
    finishedFor.current = episode.id
    savePosition(episode.id, 0)
    setPlayed(episode.id, episode.podcastId, true)
    const nextId = removeFromQueueOnFinish(queue, episode.id, removeFromQueue)
    if (nextId) loadEpisode(nextId, { autoplay: true })
  }, [status.didJustFinish, episode, queue, savePosition, setPlayed, removeFromQueue, loadEpisode])

  // Backgrounding is the closest mobile equivalent of Electron's
  // before-quit (src/main/index.ts in the desktop app): it's the last
  // reliable signal before iOS can suspend or kill the process, since
  // there's no dependable hook for actual termination. Playback itself
  // keeps running in the background (shouldPlayInBackground above), so this
  // mainly protects the case where the app is paused and then closed, or
  // killed shortly after backgrounding before the next periodic save.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushPositionRef.current()
    })
    return () => subscription.remove()
  }, [])

  return null
}
