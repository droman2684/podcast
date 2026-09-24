import { useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, type AudioSource } from 'expo-audio'
import { nextInQueue } from '@shared/queueView'
import { useStore } from '../state/store'
import { removeFromQueueOnFinish } from '../lib/queueHelpers'
import { buildEpisodeIndex } from '../lib/episodeIndex'
import { getEffectiveQueue } from '../lib/queueOrder'
import { getPrivateFeedCredential, basicAuthHeader, resolvePrivateStreamUrl } from '../lib/privateFeedCredentials'

const SAVE_INTERVAL_MS = 3000
// How close to the end counts as "finished" for the fallback end detector
// below — covers streams whose reported duration runs slightly past the
// last audio frame.
const END_TOLERANCE_SEC = 1
// How often / how long the resume-position seeding below waits for the
// native player to finish loading a newly replaced source.
const LOAD_POLL_MS = 200
const LOAD_WAIT_MAX_MS = 15000

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
  const podcastVolume = useStore((s) => s.podcastVolume)
  const downloadedUris = useStore((s) => s.downloadedUris)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const podcasts = useStore((s) => s.podcasts)
  const queue = useStore((s) => s.queue)
  const stationQueue = useStore((s) => s.stationQueue)
  const queueSource = useStore((s) => s.queueSource)
  const savePosition = useStore((s) => s.savePosition)
  const fetchLatestPosition = useStore((s) => s.fetchLatestPosition)
  const setPlayed = useStore((s) => s.setPlayed)
  const removeFromQueue = useStore((s) => s.removeFromQueue)
  const removeFromStationQueue = useStore((s) => s.removeFromStationQueue)
  const removeDownload = useStore((s) => s.removeDownload)
  const clearSeekRequest = useStore((s) => s.clearSeekRequest)
  const setPlaybackTime = useStore((s) => s.setPlaybackTime)
  const loadEpisode = useStore((s) => s.loadEpisode)
  const pausePlayback = useStore((s) => s.pausePlayback)
  const sleepTimerEndAt = useStore((s) => s.sleepTimerEndAt)
  const sleepTimerEndOfEpisode = useStore((s) => s.sleepTimerEndOfEpisode)
  const clearSleepTimer = useStore((s) => s.clearSleepTimer)

  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])
  const episode = currentEpisodeId ? (episodeIndex.get(currentEpisodeId) ?? null) : null
  const podcast = episode ? podcasts.find((p) => p.id === episode.podcastId) : null

  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const loadedEpisodeId = useRef<string | null>(null)
  const seededPositionFor = useRef<string | null>(null)
  // Which episode player.replace() has actually been called for — distinct
  // from loadedEpisodeId because a private feed's replace() lands only
  // after an async credential lookup, and until then the native player
  // still holds (and reports as loaded) the previous episode.
  const replacedFor = useRef<string | null>(null)
  // Tracked in state (not a ref) so the autoplay effect below re-runs once
  // seeding finishes — it needs to actually see the value change, not just
  // read a mutable ref on some other render.
  const [seedReadyFor, setSeedReadyFor] = useState<string | null>(null)
  const finishedFor = useRef<string | null>(null)
  // Which episode the native player has actually been seen playing since it
  // was loaded — gates the fallback end detector so a stale "at the end"
  // status left over from the previous episode can't mark the next one
  // finished before it has even started.
  const sawPlayingFor = useRef<string | null>(null)
  const prevDidJustFinish = useRef(false)

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

  // doNotMix explicitly: expo-audio's native default is mixWithOthers, which
  // (a) isn't a podcast app's behavior and (b) left the session category
  // flip-flopping against MediaController's lock-screen patch, which forces
  // a non-mixable .playback category every time an episode loads.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(
      () => {}
    )
  }, [])

  // play() re-activates the audio session natively and throws if that
  // fails — which can happen right after another app has taken the session
  // over. Previously that throw escaped the effect and the tap was simply
  // lost; now it re-asserts the audio mode and retries once.
  const safePlay = (): void => {
    try {
      player.play()
    } catch (err) {
      console.error('[audio] play() failed, re-activating session:', err)
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })
        .then(() => player.play())
        .catch((retryErr) => {
          console.error('[audio] play() retry failed:', retryErr)
          pausePlayback()
        })
    }
  }

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
    // Replaying an episode that already finished once this session must be
    // able to finish (and auto-advance) again.
    finishedFor.current = null
    sawPlayingFor.current = null
    const downloadedUri = downloadedUris[episode.id]
    if (downloadedUri) {
      player.replace(downloadedUri)
      replacedFor.current = episode.id
      return
    }
    if (!podcast?.isPrivate) {
      player.replace(episode.audioUrl)
      replacedFor.current = episode.id
      return
    }
    getPrivateFeedCredential(podcast.id).then(async (credential) => {
      // Bail if a different episode loaded while this lookup was in flight.
      if (loadedEpisodeId.current !== episode.id) return
      if (!credential) {
        player.replace(episode.audioUrl)
        replacedFor.current = episode.id
        return
      }
      const authHeader = basicAuthHeader(credential.user, credential.password)
      const resolvedUrl = await resolvePrivateStreamUrl(episode.audioUrl, authHeader)
      if (loadedEpisodeId.current !== episode.id) return
      const source: AudioSource = { uri: resolvedUrl, headers: { Authorization: authHeader } }
      player.replace(source)
      replacedFor.current = episode.id
    })
  }, [episode?.id, episode?.audioUrl, downloadedUris, podcast?.isPrivate, podcast?.id, player])

  // Fetches this episode's position fresh from Supabase rather than trusting
  // the local `positions` cache, which reflects whatever this device last
  // synced — possibly stale if listening happened on another device since.
  // Falls back to the local value only if the fetch fails (e.g. offline).
  // Autoplay below is gated on seedReadyFor so play() can't fire until the
  // seekTo() here has actually landed — otherwise a fresh player.replace()
  // reports currentTime 0 and starts playing from there for the instant
  // between load and this fetch resolving, which on a second device looked
  // like the episode "restarting" right after briefly showing the correct
  // resume position.
  //
  // Waits on the native player's own isLoaded (polled) rather than
  // status.isLoaded: iOS emits no status event on replace(), so right after
  // an episode ends status.isLoaded is still the *previous* item's `true`,
  // and it may flip false/true again while the fetch below is in flight.
  // That flip used to cancel the fetch, and the seededPositionFor guard then
  // stopped it from ever re-running — seedReadyFor never got set, so the
  // autoplay effect's gate stayed shut and nothing could play the
  // auto-advanced episode until the app was restarted.
  useEffect(() => {
    if (!episode || seededPositionFor.current === episode.id) return
    seededPositionFor.current = episode.id
    let cancelled = false
    let done = false
    const episodeId = episode.id
    const startedAt = Date.now()
    let poll: ReturnType<typeof setTimeout> | null = null
    const nativeLoaded = (): boolean => {
      try {
        return replacedFor.current === episodeId && player.isLoaded
      } catch {
        return false
      }
    }
    const seed = (): void => {
      if (cancelled) return
      // A source that never loads (bad URL, offline stream) still gets its
      // gate opened eventually, so play() can at least be attempted.
      const timedOut = Date.now() - startedAt > LOAD_WAIT_MAX_MS
      if (!nativeLoaded() && !timedOut) {
        poll = setTimeout(seed, LOAD_POLL_MS)
        return
      }
      fetchLatestPosition(episodeId)
        .then((remoteSec) => {
          if (cancelled || loadedEpisodeId.current !== episodeId || !nativeLoaded()) return
          const saved = remoteSec ?? useStore.getState().positions[episodeId] ?? 0
          if (saved > 0) player.seekTo(saved)
        })
        .catch(() => {})
        .finally(() => {
          if (cancelled) return
          done = true
          setSeedReadyFor(episodeId)
        })
    }
    seed()
    return () => {
      cancelled = true
      if (poll) clearTimeout(poll)
      // Interrupted before finishing — let the next run for this same
      // episode start over instead of bailing on the guard above.
      if (!done && seededPositionFor.current === episodeId) seededPositionFor.current = null
    }
  }, [episode?.id, player, fetchLatestPosition])

  // status.isLoaded is in the deps so autoplay actually takes effect: right
  // after switching episodes, player.replace() has been called but the new
  // source hasn't finished loading yet, so a play() issued in that same tick
  // is silently dropped by expo-audio. Re-running once isLoaded flips true
  // catches that case — without it, autoplaying from Queue/Downloads left
  // the episode paused until the user tapped play a second time.
  // Also gated on seedReadyFor matching the current episode — see the
  // seeding effect above for why: without this, play() could start the
  // player at position 0 before the resume-position fetch/seekTo above had
  // a chance to run.
  useEffect(() => {
    if (episode?.id && seedReadyFor !== episode.id) return
    if (playing) safePlay()
    else player.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, episode?.id, status.isLoaded, player, seedReadyFor])

  // Native -> store sync. iOS pauses the player on its own when another app
  // takes over audio (or headphones unplug, or the lock screen's pause is
  // used), but `playing` in the store stayed true — so the UI still showed a
  // pause button, and the first tap after coming back sent a *pause* to an
  // already-paused player: it looked like the app ignored play entirely.
  // Edge-triggered on status.playing so it only reacts to an actual change,
  // and skipped while buffering (a stall isn't a pause) or while an episode
  // switch/seed is still in flight (replace() pauses natively too).
  const prevStatusPlaying = useRef(false)
  useEffect(() => {
    const was = prevStatusPlaying.current
    prevStatusPlaying.current = status.playing
    if (status.playing && episode?.id && loadedEpisodeId.current === episode.id && seedReadyFor === episode.id) {
      sawPlayingFor.current = episode.id
    }
    if (was === status.playing) return
    if (!episode || loadedEpisodeId.current !== episode.id || seedReadyFor !== episode.id) return
    if (status.isBuffering) return
    const atEnd = status.duration > 0 && status.currentTime >= status.duration - END_TOLERANCE_SEC
    const storePlaying = useStore.getState().playing
    if (!status.playing && storePlaying && !atEnd) pausePlayback()
    else if (status.playing && !storePlaying) useStore.setState({ playing: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.playing, status.isBuffering, episode?.id, seedReadyFor, pausePlayback])

  // Same reconciliation on returning to the foreground, reading the native
  // player directly — status events emitted while the app was suspended
  // aren't guaranteed to have been delivered.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      const id = useStore.getState().currentEpisodeId
      if (!id || loadedEpisodeId.current !== id) return
      let nativePlaying: boolean
      let nativeBuffering: boolean
      try {
        nativePlaying = player.playing
        nativeBuffering = player.isBuffering
      } catch {
        return
      }
      if (useStore.getState().playing && !nativePlaying && !nativeBuffering) pausePlayback()
    })
    return () => subscription.remove()
  }, [player, pausePlayback])

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
    player.volume = podcast ? (podcastVolume[podcast.id] ?? 1) : 1
  }, [podcast, podcastVolume, episode?.id, player])

  // Saves the seek target directly rather than waiting for the next
  // periodic tick (up to SAVE_INTERVAL_MS later) or for currentTimeRef to
  // catch up — status.currentTime updates asynchronously after seekTo(), so
  // a flush right after seeking could otherwise still save the pre-seek
  // position. Scrubbing then immediately switching devices should resume
  // from where you scrubbed to, not from a few seconds before it.
  useEffect(() => {
    if (seekRequestSec === null) return
    // Skip-forward near the end requests exactly `duration`. Seeking an
    // AVPlayer to its very last frame doesn't reliably produce an
    // end-of-item event, so stop just short and let playback run out
    // naturally (the end detector below also catches it if it doesn't).
    const duration = status.duration
    const target =
      duration > END_TOLERANCE_SEC ? Math.min(seekRequestSec, duration - END_TOLERANCE_SEC / 2) : seekRequestSec
    player.seekTo(target)
    clearSeekRequest()
    // Scrubbing back into an episode that already finished lets it finish
    // (and auto-advance) again.
    if (duration <= 0 || target < duration - END_TOLERANCE_SEC) finishedFor.current = null
    const id = loadedEpisodeId.current
    if (id && target > 0) {
      currentTimeRef.current = target
      savePosition(id, target)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequestSec, player, clearSeekRequest, savePosition])

  useEffect(() => {
    setPlaybackTime(status.currentTime, status.duration)
  }, [status.currentTime, status.duration, setPlaybackTime])

  // A single timeout keyed to sleepTimerEndAt rather than a polling
  // interval — setSleepTimerMinutes always sets an absolute timestamp, so
  // this just needs to fire once at that moment (or immediately if it's
  // already passed, e.g. the app was backgrounded through the deadline).
  useEffect(() => {
    if (!sleepTimerEndAt) return
    const msLeft = sleepTimerEndAt - Date.now()
    if (msLeft <= 0) {
      pausePlayback()
      clearSleepTimer()
      return
    }
    const timeout = setTimeout(() => {
      pausePlayback()
      clearSleepTimer()
    }, msLeft)
    return () => clearTimeout(timeout)
  }, [sleepTimerEndAt, pausePlayback, clearSleepTimer])

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
    // `playing` included so Now Playing / remote commands are re-claimed
    // whenever playback resumes — another app that played in the meantime
    // owns the lock-screen controls until we assert them again.
  }, [
    status.isLoaded,
    playing,
    episode?.id,
    episode?.title,
    episode?.artworkUrl,
    podcast?.name,
    podcast?.artworkUrl,
    player
  ])

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

  // expo-audio's didJustFinish is level-triggered, not a one-shot event: it
  // stays true across renders until the next item's status update arrives
  // (which can take a while over the network), not just for the render
  // where the episode actually ended. Reacting to it here on every render
  // where it happens to be true — rather than only on the false→true
  // edge — meant that calling loadEpisode(nextId) below (which swaps
  // `episode` to the next queue entry and re-runs this effect while the
  // native status still hadn't caught up) treated the *next*, still-unplayed
  // episode as finished too, and the one after that, cascading through and
  // emptying the entire queue in one burst every time a single episode
  // actually finished.
  //
  // didJustFinish is also only a one-event pulse, and useAudioPlayerStatus
  // is a plain setState per native event — when the end-of-item event lands
  // right alongside another (e.g. the seek-complete event after skipping
  // forward past the last few minutes), React batches them and the pulse is
  // never rendered, so the episode just sat at the end without advancing.
  // The fallback below catches that: the player stopped at the end while
  // the store still wants playback, for an episode that was actually seen
  // playing after it loaded (see sawPlayingFor).
  useEffect(() => {
    const justFinished = status.didJustFinish && !prevDidJustFinish.current
    prevDidJustFinish.current = status.didJustFinish
    const stoppedAtEnd =
      !!episode &&
      playing &&
      !status.playing &&
      !status.isBuffering &&
      sawPlayingFor.current === episode.id &&
      loadedEpisodeId.current === episode.id &&
      status.duration > 0 &&
      status.currentTime >= status.duration - END_TOLERANCE_SEC
    if (!(justFinished || stoppedAtEnd) || !episode || finishedFor.current === episode.id) return
    finishedFor.current = episode.id
    savePosition(episode.id, 0)
    setPlayed(episode.id, episode.podcastId, true)
    // A station's playlist is a separate, local-only list from the main
    // queue (see store.ts's queueSource) — auto-advance has to walk
    // whichever one is actually playing, same as PlayerBar/PlayerScreen's
    // prev/next controls.
    const nextId =
      queueSource === 'station'
        ? (() => {
            const id = nextInQueue(stationQueue, episode.id)
            removeFromStationQueue(episode.id)
            return id
          })()
        : // The order the queue actually plays in (auto or manual).
          removeFromQueueOnFinish(getEffectiveQueue(useStore.getState()), episode.id, removeFromQueue)
    // Default-on: a downloaded episode's local file is only useful until
    // it's been listened to, so free the space automatically once it's done
    // rather than leaving finished downloads sitting on disk indefinitely.
    if (downloadedUris[episode.id]) removeDownload(episode.id)
    // "End of episode" sleep timer mode: the episode that just finished IS
    // the stopping point, so stay paused on it (still removed from its
    // queue above) instead of auto-advancing into the next one.
    if (sleepTimerEndOfEpisode) {
      pausePlayback()
      clearSleepTimer()
      return
    }
    if (nextId) loadEpisode(nextId, { autoplay: true })
    // Nothing left to advance to — reflect that the player has stopped
    // rather than leaving the UI showing a pause button over a dead player.
    else pausePlayback()
  }, [
    status.didJustFinish,
    status.playing,
    status.isBuffering,
    status.currentTime,
    status.duration,
    playing,
    episode,
    queue,
    stationQueue,
    queueSource,
    downloadedUris,
    sleepTimerEndOfEpisode,
    pausePlayback,
    clearSleepTimer,
    savePosition,
    setPlayed,
    removeFromQueue,
    removeFromStationQueue,
    removeDownload,
    loadEpisode
  ])

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
