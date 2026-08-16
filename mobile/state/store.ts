import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Podcast, Episode, PodcastSettings } from '@shared/types'
import type { DiscoverPodcast } from '@shared/types'
import { supabase } from '../lib/supabase'
import { parseFeed } from '../lib/rss'
import { downloadEpisode as downloadEpisodeFile, deleteDownload, listDownloadedUris } from '../lib/downloads'

export type LibraryView = 'grid' | 'list'

// Device-local UI preferences (skip durations, default library view) —
// mirrors the desktop app's windowBounds/columnLayout: real, but not
// sync-worthy data, so these live in AsyncStorage on this device only,
// never in Supabase.
const SETTINGS_STORAGE_KEY = 'empirepod.settings.v1'

interface LocalSettings {
  skipBackSec: number
  skipForwardSec: number
  defaultLibraryView: LibraryView
}

const DEFAULT_SETTINGS: LocalSettings = {
  skipBackSec: 15,
  skipForwardSec: 15,
  defaultLibraryView: 'grid'
}

async function saveSettings(settings: LocalSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.error('[settings] save failed:', err)
  }
}

interface PodcastRow {
  id: string
  feed_url: string
  is_private: boolean
  custom_artwork_url: string | null
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// The Supabase JS client never throws on a failed write — it resolves with
// an { error } field instead. Skipping this check (as an earlier version of
// this file did) makes a failed write look identical to a successful one:
// the UI updates optimistically, the database never does, and the change
// silently reverts on the next reload.
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

interface AppState {
  authLoading: boolean
  signedIn: boolean
  userEmail: string | null

  podcasts: Podcast[]
  episodesByPodcast: Record<string, Episode[]>
  positions: Record<string, number>
  podcastSettings: Record<string, PodcastSettings>
  queue: string[]
  libraryLoading: boolean
  libraryLoaded: boolean
  libraryError: string | null

  skipBackSec: number
  skipForwardSec: number
  defaultLibraryView: LibraryView
  settingsLoaded: boolean
  loadSettings: () => Promise<void>
  setSkipBackSec: (sec: number) => void
  setSkipForwardSec: (sec: number) => void
  setDefaultLibraryView: (view: LibraryView) => void

  initAuth: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>

  loadLibrary: () => Promise<void>
  subscribe: (podcast: DiscoverPodcast) => Promise<void>
  unsubscribe: (podcastId: string) => Promise<void>
  setNotify: (podcastId: string, notify: boolean) => Promise<void>

  savePosition: (episodeId: string, positionSec: number) => Promise<void>
  setPlayed: (episodeId: string, podcastId: string, played: boolean) => Promise<void>
  markAllPlayed: (podcastId: string) => Promise<void>

  addToQueue: (episodeId: string) => Promise<void>
  removeFromQueue: (episodeId: string) => Promise<void>
  reorderQueue: (episodeIds: string[]) => Promise<void>

  // Downloaded audio, keyed by episode id -> local file uri. Device-local
  // only (see downloads.ts) — never synced. `downloadingIds` tracks in-flight
  // downloads so a row can show a spinner instead of the download button.
  downloadedUris: Record<string, string>
  downloadingIds: Record<string, boolean>
  loadDownloads: () => void
  downloadEpisode: (episode: Episode) => Promise<void>
  removeDownload: (episodeId: string) => void

  // Live playback state, read/written by AudioEngine (components/AudioEngine.tsx,
  // mounted once at the app root) and by any screen that wants to control or
  // display playback — mirrors the desktop app's useAudioEngine.ts pattern of
  // one persistent player driven by global store state, rather than each
  // screen owning its own player instance.
  currentEpisodeId: string | null
  playing: boolean
  currentTimeSec: number
  duration: number
  seekRequestSec: number | null
  playbackRate: number
  loadEpisode: (episodeId: string, opts?: { autoplay?: boolean }) => void
  togglePlay: () => void
  requestSeek: (sec: number) => void
  clearSeekRequest: () => void
  setPlaybackTime: (currentTimeSec: number, duration: number) => void
  setPlaybackRate: (rate: number) => void
}

async function saveQueue(episodeIds: string[]): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return
  try {
    unwrap(
      await supabase.from('queue').upsert({
        user_id: userId,
        episode_ids: episodeIds,
        updated_at: new Date().toISOString()
      })
    )
    console.log(`[queue] saved order: ${episodeIds.length} episode(s)`)
  } catch (err) {
    console.error('[queue] save failed:', err)
    throw err
  }
}

const PAGE_SIZE = 1000

// Supabase caps a single .select() at 1000 rows by default — silently, with
// no error, just a truncated result. episode_played in particular can
// easily exceed that for a library with a long listening history (one real
// account here has 16,000+), and a truncated read makes every episode past
// row 1000 look never-played on the very next reload even though the write
// succeeded.
//
// Pass { count: 'exact' } in the caller's .select() — the first page's
// response includes the true row count, so every remaining page can be
// requested in parallel instead of one-at-a-time. 17 sequential round trips
// for 16,000 rows was taking the better part of a minute; firing the other
// 16 concurrently once the total is known takes roughly as long as one.
async function fetchAllRows<T>(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>
): Promise<T[]> {
  const first = await query(0, PAGE_SIZE - 1)
  if (first.error) throw new Error(first.error.message)
  const firstPage = first.data ?? []
  const total = first.count ?? firstPage.length
  if (total <= firstPage.length) return firstPage

  const remainingStarts: number[] = []
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) remainingStarts.push(from)

  const restResults = await Promise.all(remainingStarts.map((from) => query(from, from + PAGE_SIZE - 1)))
  const rest: T[] = []
  for (const result of restResults) {
    if (result.error) throw new Error(result.error.message)
    rest.push(...(result.data ?? []))
  }
  return [...firstPage, ...rest]
}

const FEED_FETCH_CONCURRENCY = 5

// A rolling worker pool rather than fixed-size batches: `mapWithConcurrency`
// used to await Promise.all() on a batch of `limit` items before starting
// the next batch, so one slow feed in a batch stalled every other slot in
// it too. Here, as soon as any worker finishes, it immediately pulls the
// next queued item — nothing sits idle waiting on a straggler. `onResult`
// lets the caller merge each feed into the store as it lands instead of
// waiting for every feed to finish before anything renders.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onResult?: (result: R, item: T, index: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const i = nextIndex++
      const result = await fn(items[i])
      results[i] = result
      onResult?.(result, items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export const useStore = create<AppState>((set, get) => ({
  authLoading: true,
  signedIn: false,
  userEmail: null,

  podcasts: [],
  episodesByPodcast: {},
  positions: {},
  podcastSettings: {},
  queue: [],
  libraryLoading: false,
  libraryLoaded: false,
  libraryError: null,

  downloadedUris: {},
  downloadingIds: {},

  skipBackSec: DEFAULT_SETTINGS.skipBackSec,
  skipForwardSec: DEFAULT_SETTINGS.skipForwardSec,
  defaultLibraryView: DEFAULT_SETTINGS.defaultLibraryView,
  settingsLoaded: false,

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      const saved = raw ? (JSON.parse(raw) as Partial<LocalSettings>) : {}
      set({
        skipBackSec: saved.skipBackSec ?? DEFAULT_SETTINGS.skipBackSec,
        skipForwardSec: saved.skipForwardSec ?? DEFAULT_SETTINGS.skipForwardSec,
        defaultLibraryView: saved.defaultLibraryView ?? DEFAULT_SETTINGS.defaultLibraryView,
        settingsLoaded: true
      })
    } catch (err) {
      console.error('[settings] load failed:', err)
      set({ settingsLoaded: true })
    }
  },

  setSkipBackSec: (sec) => {
    set({ skipBackSec: sec })
    const { skipBackSec, skipForwardSec, defaultLibraryView } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView })
  },

  setSkipForwardSec: (sec) => {
    set({ skipForwardSec: sec })
    const { skipBackSec, skipForwardSec, defaultLibraryView } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView })
  },

  setDefaultLibraryView: (view) => {
    set({ defaultLibraryView: view })
    const { skipBackSec, skipForwardSec, defaultLibraryView } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView })
  },

  currentEpisodeId: null,
  playing: false,
  currentTimeSec: 0,
  duration: 0,
  seekRequestSec: null,
  playbackRate: 1,

  initAuth: async () => {
    const { data } = await supabase.auth.getSession()
    set({
      signedIn: data.session !== null,
      userEmail: data.session?.user.email ?? null,
      authLoading: false
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ signedIn: session !== null, userEmail: session?.user.email ?? null })
    })
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({
      podcasts: [],
      episodesByPodcast: {},
      positions: {},
      podcastSettings: {},
      queue: [],
      libraryLoaded: false
    })
  },

  // Pulls the subscription list synced from desktop (or a previous mobile
  // session), then fetches each feed's RSS directly (there's no
  // main-process cache to lean on here) to get episode lists and
  // artwork/name — the same split the desktop app itself uses: `podcasts`
  // rows are identity/settings only, never the RSS-derived fields. Feeds
  // fetch with bounded concurrency rather than one-at-a-time — sequential
  // awaits here made a 15-show library take tens of seconds to load, on
  // every single visit to the Library tab.
  loadLibrary: async () => {
    set({ libraryLoading: true, libraryError: null })
    try {
      const userId = await currentUserId()
      if (!userId) throw new Error('Not signed in')

      // These five reads are independent of each other — running them in
      // parallel rather than as sequential awaits removes ~4 network
      // round-trips worth of latency before RSS fetching even starts.
      const [podcastRows, positionRows, playedRows, settingsRows, queueResult] = await Promise.all([
        fetchAllRows<PodcastRow>((from, to) =>
          supabase
            .from('podcasts')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .is('deleted_at', null)
            .range(from, to)
        ),
        fetchAllRows<{ episode_id: string; position_sec: number }>((from, to) =>
          supabase
            .from('playback_positions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .range(from, to)
        ),
        fetchAllRows<{ episode_id: string; played: boolean }>((from, to) =>
          supabase
            .from('episode_played')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .range(from, to)
        ),
        fetchAllRows<{ podcast_id: string; notify: boolean }>((from, to) =>
          supabase
            .from('podcast_settings')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .range(from, to)
        ),
        supabase.from('queue').select('*').eq('user_id', userId).maybeSingle()
      ])
      console.log(`[loadLibrary] ${podcastRows.length} non-deleted podcast row(s)`)

      const positions: Record<string, number> = {}
      for (const row of positionRows) positions[row.episode_id] = row.position_sec

      const playedByEpisode = new Map<string, boolean>(playedRows.map((r) => [r.episode_id, r.played]))
      console.log(
        `[loadLibrary] ${playedRows.length} episode_played row(s), ${playedRows.filter((r) => r.played).length} marked played`
      )

      const podcastSettings: Record<string, PodcastSettings> = {}
      for (const row of settingsRows) podcastSettings[row.podcast_id] = { notify: row.notify }

      const queueRow = unwrap(queueResult)
      const queue: string[] = Array.isArray(queueRow?.episode_ids) ? queueRow.episode_ids : []

      set({ positions, podcastSettings, queue })

      const publicRows = (podcastRows ?? []).filter((row) => !row.is_private)
      // Private feeds need a password that, by design, never leaves the
      // device that created them (see the desktop app's privateFeeds.ts) —
      // not supported on mobile yet, so skipped rather than shown as a feed
      // that can never actually load here.
      const rowOrder = new Map(publicRows.map((row, i) => [row.id, i]))

      // Merges each feed into the store as soon as it's parsed, instead of
      // waiting for every feed to finish — previously the whole screen sat
      // behind a blank spinner until even the single slowest podcast's feed
      // had loaded. Re-sorted by original subscription order each time so
      // the grid doesn't reshuffle as results race in out of order.
      const mergeFeed = (result: { podcast: Podcast; episodes: Episode[] } | null): void => {
        if (!result) return
        set((state) => ({
          podcasts: [...state.podcasts.filter((p) => p.id !== result.podcast.id), result.podcast].sort(
            (a, b) => (rowOrder.get(a.id) ?? 0) - (rowOrder.get(b.id) ?? 0)
          ),
          episodesByPodcast: { ...state.episodesByPodcast, [result.podcast.id]: result.episodes }
        }))
      }

      await mapWithConcurrency(
        publicRows,
        FEED_FETCH_CONCURRENCY,
        async (row) => {
          try {
            const parsed = await parseFeed(row.feed_url, row.id)
            const episodes = parsed.episodes.map((e) => ({
              ...e,
              played: playedByEpisode.get(e.id) ?? false
            }))
            const podcast: Podcast = {
              id: row.id,
              feedUrl: row.feed_url,
              name: parsed.name,
              author: parsed.author,
              artworkUrl: parsed.artworkUrl,
              customArtworkUrl: row.custom_artwork_url,
              description: parsed.description,
              category: parsed.category,
              unread: episodes.filter((e) => !e.played).length,
              isPrivate: false
            }
            return { podcast, episodes }
          } catch (err) {
            console.error(`Failed to load feed ${row.feed_url}:`, err)
            return null
          }
        },
        mergeFeed
      )

      // Final sweep to drop any podcast that's no longer subscribed (e.g.
      // unsubscribed from another device since the last load) — mergeFeed
      // above only ever adds/updates entries for rows that are still there.
      set((state) => ({
        podcasts: state.podcasts.filter((p) => rowOrder.has(p.id)),
        episodesByPodcast: Object.fromEntries(
          Object.entries(state.episodesByPodcast).filter(([id]) => rowOrder.has(id))
        ),
        libraryLoading: false,
        libraryLoaded: true
      }))
    } catch (err) {
      set({ libraryLoading: false, libraryError: err instanceof Error ? err.message : String(err) })
    }
  },

  subscribe: async (podcast) => {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not signed in')
    unwrap(
      await supabase.from('podcasts').upsert({
        user_id: userId,
        id: podcast.id,
        feed_url: podcast.feedUrl,
        is_private: false,
        custom_artwork_url: null,
        updated_at: new Date().toISOString(),
        deleted_at: null
      })
    )
    await get().loadLibrary()
  },

  // Mirrors the desktop app's unsubscribe cascade (src/main/subscriptions.ts
  // applyUnsubscribeCascade) as far as it applies here: drop the podcast
  // locally, tombstone it remotely, and strip its episodes out of the
  // queue. Stations aren't a mobile concept yet, so no station cleanup.
  unsubscribe: async (podcastId) => {
    const userId = await currentUserId()
    if (!userId) return
    const removedEpisodeIds = new Set((get().episodesByPodcast[podcastId] ?? []).map((e) => e.id))
    const previousQueue = get().queue
    const nextQueue = previousQueue.filter((id) => !removedEpisodeIds.has(id))
    const queueChanged = nextQueue.length !== previousQueue.length
    set((state) => ({
      podcasts: state.podcasts.filter((p) => p.id !== podcastId),
      episodesByPodcast: Object.fromEntries(
        Object.entries(state.episodesByPodcast).filter(([id]) => id !== podcastId)
      ),
      queue: nextQueue
    }))
    const now = new Date().toISOString()
    try {
      unwrap(
        await supabase
          .from('podcasts')
          .upsert({ user_id: userId, id: podcastId, deleted_at: now, updated_at: now })
      )
      console.log(`[unsubscribe] tombstoned ${podcastId}`)
    } catch (err) {
      console.error(`[unsubscribe] tombstone failed for ${podcastId}:`, err)
    }
    if (queueChanged) await saveQueue(nextQueue)
  },

  setNotify: async (podcastId, notify) => {
    set((state) => ({
      podcastSettings: { ...state.podcastSettings, [podcastId]: { notify } }
    }))
    const userId = await currentUserId()
    if (!userId) return
    unwrap(
      await supabase.from('podcast_settings').upsert({
        user_id: userId,
        podcast_id: podcastId,
        notify,
        updated_at: new Date().toISOString()
      })
    )
  },

  savePosition: async (episodeId, positionSec) => {
    set((state) => ({ positions: { ...state.positions, [episodeId]: positionSec } }))
    const userId = await currentUserId()
    if (!userId) return
    unwrap(
      await supabase.from('playback_positions').upsert({
        user_id: userId,
        episode_id: episodeId,
        position_sec: positionSec,
        updated_at: new Date().toISOString()
      })
    )
  },

  setPlayed: async (episodeId, podcastId, played) => {
    set((state) => {
      const episodes = (state.episodesByPodcast[podcastId] ?? []).map((e) =>
        e.id === episodeId ? { ...e, played } : e
      )
      return {
        episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: episodes },
        podcasts: state.podcasts.map((p) =>
          p.id === podcastId ? { ...p, unread: episodes.filter((e) => !e.played).length } : p
        )
      }
    })
    const userId = await currentUserId()
    if (!userId) return
    try {
      unwrap(
        await supabase.from('episode_played').upsert({
          user_id: userId,
          episode_id: episodeId,
          podcast_id: podcastId,
          played,
          updated_at: new Date().toISOString()
        })
      )
      console.log(`[played] saved ${episodeId} -> ${played}`)
    } catch (err) {
      console.error(`[played] save failed for ${episodeId}:`, err)
    }
  },

  // One batched upsert for the whole show rather than one request per
  // episode — the desktop sync's initial push made the same mistake at
  // scale (thousands of individual requests) before being fixed to batch.
  markAllPlayed: async (podcastId) => {
    const episodes = get().episodesByPodcast[podcastId] ?? []
    const unplayed = episodes.filter((e) => !e.played)
    if (unplayed.length === 0) return

    const userId = await currentUserId()
    if (!userId) return
    const updatedAt = new Date().toISOString()
    unwrap(
      await supabase.from('episode_played').upsert(
        unplayed.map((e) => ({
          user_id: userId,
          episode_id: e.id,
          podcast_id: podcastId,
          played: true,
          updated_at: updatedAt
        }))
      )
    )

    set((state) => {
      const updated = (state.episodesByPodcast[podcastId] ?? []).map((e) => ({ ...e, played: true }))
      return {
        episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: updated },
        podcasts: state.podcasts.map((p) => (p.id === podcastId ? { ...p, unread: 0 } : p))
      }
    })
  },

  addToQueue: async (episodeId) => {
    if (get().queue.includes(episodeId)) return
    const next = [...get().queue, episodeId]
    set({ queue: next })
    await saveQueue(next)
  },

  removeFromQueue: async (episodeId) => {
    const next = get().queue.filter((id) => id !== episodeId)
    set({ queue: next })
    await saveQueue(next)
  },

  reorderQueue: async (episodeIds) => {
    set({ queue: episodeIds })
    await saveQueue(episodeIds)
  },

  loadDownloads: () => {
    try {
      set({ downloadedUris: listDownloadedUris() })
    } catch (err) {
      console.error('[downloads] listing failed:', err)
    }
  },

  downloadEpisode: async (episode) => {
    if (get().downloadedUris[episode.id] || get().downloadingIds[episode.id]) return
    set((state) => ({ downloadingIds: { ...state.downloadingIds, [episode.id]: true } }))
    try {
      const uri = await downloadEpisodeFile(episode.id, episode.audioUrl)
      set((state) => ({ downloadedUris: { ...state.downloadedUris, [episode.id]: uri } }))
    } catch (err) {
      console.error(`[downloads] failed for ${episode.id}:`, err)
    } finally {
      set((state) => {
        const { [episode.id]: _removed, ...rest } = state.downloadingIds
        return { downloadingIds: rest }
      })
    }
  },

  removeDownload: (episodeId) => {
    const uri = get().downloadedUris[episodeId]
    if (!uri) return
    deleteDownload(uri)
    set((state) => {
      const { [episodeId]: _removed, ...rest } = state.downloadedUris
      return { downloadedUris: rest }
    })
  },

  loadEpisode: (episodeId, opts) => {
    const changed = get().currentEpisodeId !== episodeId
    set({
      currentEpisodeId: episodeId,
      playing: opts?.autoplay ?? true,
      ...(changed ? { currentTimeSec: 0, duration: 0 } : {})
    })
  },

  togglePlay: () => set((state) => ({ playing: !state.playing })),

  requestSeek: (sec) => set({ seekRequestSec: sec }),
  clearSeekRequest: () => set({ seekRequestSec: null }),

  setPlaybackTime: (currentTimeSec, duration) => set({ currentTimeSec, duration }),
  setPlaybackRate: (rate) => set({ playbackRate: rate })
}))
