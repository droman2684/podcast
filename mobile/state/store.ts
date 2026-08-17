import { create } from 'zustand'
import { AppState as RNAppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Podcast, Episode, PodcastSettings, Station, PrivateFeed } from '@shared/types'
import type { DiscoverPodcast } from '@shared/types'
import { supabase } from '../lib/supabase'
import { parseFeed } from '../lib/rss'
import { downloadEpisode as downloadEpisodeFile, deleteDownload, listDownloadedUris } from '../lib/downloads'
import { hashId } from '../lib/hash'
import {
  getPrivateFeedCredential,
  savePrivateFeedCredential,
  deletePrivateFeedCredential,
  basicAuthHeader
} from '../lib/privateFeedCredentials'

export type LibraryView = 'grid' | 'list' | 'category'

// Device-local UI preferences (skip durations, default library view) —
// mirrors the desktop app's windowBounds/columnLayout: real, but not
// sync-worthy data, so these live in AsyncStorage on this device only,
// never in Supabase.
const SETTINGS_STORAGE_KEY = 'empirepod.settings.v1'

interface LocalSettings {
  skipBackSec: number
  skipForwardSec: number
  defaultLibraryView: LibraryView
  queueGroupedByShow: boolean
}

const DEFAULT_SETTINGS: LocalSettings = {
  skipBackSec: 15,
  skipForwardSec: 15,
  defaultLibraryView: 'grid',
  queueGroupedByShow: false
}

async function saveSettings(settings: LocalSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.error('[settings] save failed:', err)
  }
}

// High-water mark (newest pubDateIso seen so far) per podcast, used to
// detect genuinely new episodes for auto-queueing. Device-local like the
// settings above — this is only a local heuristic for "what's new since I
// last looked," not a source of truth, so it doesn't need to sync: the
// queue itself is synced and de-duped, so a second device with a different
// high-water mark can never double-add an episode another device already
// queued. Not tracked as full id sets (could grow unbounded for
// long-running shows) — a single date per podcast is enough to know what's
// new without an ever-growing list.
const LAST_SEEN_STORAGE_KEY = 'empirepod.lastSeenEpisodeDate.v1'

// Local durable cache of playback positions, mirroring the desktop app's
// disk-backed playbackPositions (src/main/persistence.ts): the Supabase
// write in savePosition() below is a network call that can lose a race with
// the app being closed, so without a local copy a same-device relaunch has
// nothing to fall back on but whatever last happened to make it to the
// server. Cloud sync stays the cross-device source of truth (see
// fetchLatestPosition/refreshPositions) — this is purely "survive this
// device closing before that write lands."
const POSITIONS_STORAGE_KEY = 'empirepod.positions.v1'

async function loadLocalPositions(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(POSITIONS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch (err) {
    console.error('[position] local load failed:', err)
    return {}
  }
}

async function saveLocalPositions(positions: Record<string, number>): Promise<void> {
  try {
    await AsyncStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions))
  } catch (err) {
    console.error('[position] local save failed:', err)
  }
}

async function loadLastSeenMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SEEN_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch (err) {
    console.error('[autoQueue] load failed:', err)
    return {}
  }
}

async function saveLastSeenMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(map))
  } catch (err) {
    console.error('[autoQueue] save failed:', err)
  }
}

interface PodcastRow {
  id: string
  feed_url: string
  is_private: boolean
  custom_artwork_url: string | null
}

interface StationRow {
  id: string
  name: string
  podcast_ids: string[] | null
  sort_by: string
  episodes_per_show: number
}

interface PrivateFeedRow {
  id: string
  name: string
  url: string
  feed_user: string
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
  authError: string | null
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
  queueGroupedByShow: boolean
  settingsLoaded: boolean
  loadSettings: () => Promise<void>
  setSkipBackSec: (sec: number) => void
  setSkipForwardSec: (sec: number) => void
  setDefaultLibraryView: (view: LibraryView) => void
  setQueueGroupedByShow: (grouped: boolean) => void

  initAuth: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  signOut: () => Promise<void>

  loadLibrary: () => Promise<void>
  subscribe: (podcast: DiscoverPodcast) => Promise<void>
  unsubscribe: (podcastId: string) => Promise<void>
  setNotify: (podcastId: string, notify: boolean) => Promise<void>

  // Hydrates `positions` from this device's local cache before anything
  // else has loaded — called once at startup (see App.tsx), same as
  // loadSettings, so a position saved just before this device's app was
  // last closed is available immediately instead of waiting on loadLibrary's
  // network round trip.
  loadCachedPositions: () => Promise<void>
  savePosition: (episodeId: string, positionSec: number) => Promise<void>
  // Fetches the authoritative position for one episode straight from
  // Supabase rather than trusting the local `positions` cache, which can be
  // stale by however long it's been since this device last loaded its
  // library — exactly the gap that made switching devices mid-listen show
  // the wrong resume point. Used by AudioEngine right before seeding
  // playback so pressing play always resumes from the truth, not a snapshot.
  fetchLatestPosition: (episodeId: string) => Promise<number | null>
  // Re-pulls just positions + queue (cheap, no RSS re-fetch) — called on
  // app foreground so Continue Listening / queue progress bars catch up
  // after listening happened on another device while this one was backgrounded.
  refreshPositions: () => Promise<void>
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

  // "Categories" in the mobile UI — backed by the same `stations` table
  // desktop uses for its Stations feature, reusing that data model as-is
  // (id/name/podcastIds) rather than inventing a parallel concept. A
  // category created on mobile shows up as a Station on desktop and vice
  // versa. sortBy/episodesPerShow (desktop-only station-as-playlist
  // settings) are left at their defaults here since mobile only uses these
  // for grouping the Library, not for aggregate playback.
  stations: Station[]
  stationsLoaded: boolean
  loadStations: () => Promise<void>
  createCategory: (name: string) => Promise<Station>
  renameCategory: (stationId: string, name: string) => Promise<void>
  deleteCategory: (stationId: string) => Promise<void>
  addPodcastToCategory: (stationId: string, podcastId: string) => Promise<void>
  removePodcastFromCategory: (stationId: string, podcastId: string) => Promise<void>

  // Private feeds: identity (name/url/user) syncs via Supabase's
  // private_feeds table same as desktop, but the password lives ONLY in
  // this device's secure storage (see lib/privateFeedCredentials.ts) —
  // never synced, never held in this state. A feed synced from another
  // device shows up with no local credential until re-entered here; those
  // ids are tracked in privateFeedsMissingCredential so the Library can
  // show a "needs password" affordance instead of a broken/empty show.
  privateFeeds: Record<string, PrivateFeed>
  privateFeedsMissingCredential: Record<string, boolean>
  addPrivateFeed: (url: string, user: string, password: string) => Promise<void>
  retryPrivateFeedCredential: (feedId: string, user: string, password: string) => Promise<void>

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

// Always writes the station's full known row rather than a partial patch —
// simplest way to guarantee sort_by/episodes_per_show (desktop-only station
// settings mobile never edits) survive a mobile-initiated rename or
// membership change unchanged.
async function upsertStation(userId: string, station: Station): Promise<void> {
  unwrap(
    await supabase.from('stations').upsert({
      user_id: userId,
      id: station.id,
      name: station.name,
      podcast_ids: station.podcastIds,
      sort_by: station.sortBy,
      episodes_per_show: station.episodesPerShow,
      updated_at: new Date().toISOString(),
      deleted_at: null
    })
  )
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
  authError: null,
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

  stations: [],
  stationsLoaded: false,

  privateFeeds: {},
  privateFeedsMissingCredential: {},

  skipBackSec: DEFAULT_SETTINGS.skipBackSec,
  skipForwardSec: DEFAULT_SETTINGS.skipForwardSec,
  defaultLibraryView: DEFAULT_SETTINGS.defaultLibraryView,
  queueGroupedByShow: DEFAULT_SETTINGS.queueGroupedByShow,
  settingsLoaded: false,

  loadCachedPositions: async () => {
    const cached = await loadLocalPositions()
    set({ positions: cached })
  },

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
      const saved = raw ? (JSON.parse(raw) as Partial<LocalSettings>) : {}
      set({
        skipBackSec: saved.skipBackSec ?? DEFAULT_SETTINGS.skipBackSec,
        skipForwardSec: saved.skipForwardSec ?? DEFAULT_SETTINGS.skipForwardSec,
        defaultLibraryView: saved.defaultLibraryView ?? DEFAULT_SETTINGS.defaultLibraryView,
        queueGroupedByShow: saved.queueGroupedByShow ?? DEFAULT_SETTINGS.queueGroupedByShow,
        settingsLoaded: true
      })
    } catch (err) {
      console.error('[settings] load failed:', err)
      set({ settingsLoaded: true })
    }
  },

  setSkipBackSec: (sec) => {
    set({ skipBackSec: sec })
    const { skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow })
  },

  setSkipForwardSec: (sec) => {
    set({ skipForwardSec: sec })
    const { skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow })
  },

  setDefaultLibraryView: (view) => {
    set({ defaultLibraryView: view })
    const { skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow })
  },

  setQueueGroupedByShow: (grouped) => {
    set({ queueGroupedByShow: grouped })
    const { skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow } = get()
    saveSettings({ skipBackSec, skipForwardSec, defaultLibraryView, queueGroupedByShow })
  },

  currentEpisodeId: null,
  playing: false,
  currentTimeSec: 0,
  duration: 0,
  seekRequestSec: null,
  playbackRate: 1,

  initAuth: async () => {
    // getSession() hanging (a slow/unreachable network on first launch, a
    // stuck AsyncStorage read, etc.) used to leave authLoading stuck true
    // forever — the app would sit on a bare, easy-to-miss spinner that read
    // as "just a white screen" with no way to tell what was wrong or to
    // retry. A hard timeout plus a try/catch ensures authLoading always
    // resolves one way or the other, and any real error is visible instead
    // of silently swallowed as an unhandled promise rejection.
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error('Timed out checking for a saved session')), 10000)
        )
      ])
      set({
        signedIn: result.data.session !== null,
        userEmail: result.data.session?.user.email ?? null,
        authLoading: false,
        authError: null
      })
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ signedIn: session !== null, userEmail: session?.user.email ?? null })
      })
    } catch (err) {
      console.error('[initAuth] failed:', err)
      set({
        authLoading: false,
        authError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
  },

  // Sends a recovery link via Supabase's own default flow — this app has no
  // custom URL scheme registered to catch a redirect, so the link opens
  // Supabase's own hosted reset page (or the redirect URL configured in the
  // Supabase dashboard's Auth settings, if one's been set there); either
  // way the password change happens in the browser, not back in the app.
  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
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
      libraryLoaded: false,
      stations: [],
      stationsLoaded: false
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

      // These six reads are independent of each other — running them in
      // parallel rather than as sequential awaits removes ~5 network
      // round-trips worth of latency before RSS fetching even starts.
      const [podcastRows, positionRows, playedRows, settingsRows, queueResult, privateFeedRows] = await Promise.all([
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
        supabase.from('queue').select('*').eq('user_id', userId).maybeSingle(),
        fetchAllRows<PrivateFeedRow>((from, to) =>
          supabase
            .from('private_feeds')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .is('deleted_at', null)
            .range(from, to)
        )
      ])
      console.log(`[loadLibrary] ${podcastRows.length} non-deleted podcast row(s)`)

      const privateFeeds: Record<string, PrivateFeed> = {}
      for (const row of privateFeedRows) {
        privateFeeds[row.id] = { id: row.id, name: row.name, url: row.url, user: row.feed_user }
      }

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

      // Local cache first, remote second: remote wins for any episode it
      // has a row for (it's authoritative once synced), but a position
      // saved locally on this device that hasn't reached the server yet
      // (offline, or just not pushed at the moment the app closed) must
      // survive this merge rather than being wiped out by a fetch that
      // simply doesn't know about it yet.
      set((state) => {
        const merged = { ...state.positions, ...positions }
        saveLocalPositions(merged).catch(() => {})
        return { positions: merged, podcastSettings, queue, privateFeeds }
      })

      const allRows = podcastRows ?? []
      const rowOrder = new Map(allRows.map((row, i) => [row.id, i]))
      const missingCredential: Record<string, boolean> = {}

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

      // A podcast with no entry yet in `lastSeen` is being loaded on this
      // device for the first time (a fresh subscribe, or the first library
      // load ever on a new device) — its whole current episode list is the
      // pre-existing backlog, not "new," so it's only used to seed the
      // high-water mark, never auto-queued. Only episodes newer than an
      // already-established mark count as new.
      const lastSeen = await loadLastSeenMap()
      const newEpisodes: Episode[] = []

      await mapWithConcurrency(
        allRows,
        FEED_FETCH_CONCURRENCY,
        async (row) => {
          // A private feed with no locally-saved credential (synced from
          // another device, never unlocked on this one) can't be fetched —
          // show it as a placeholder using the identity synced via
          // private_feeds instead of silently dropping it or erroring.
          let authHeader: string | undefined
          if (row.is_private) {
            const credential = await getPrivateFeedCredential(row.id)
            if (!credential) {
              missingCredential[row.id] = true
              const identity = privateFeeds[row.id]
              const podcast: Podcast = {
                id: row.id,
                feedUrl: row.feed_url,
                name: identity?.name ?? identity?.url ?? row.feed_url,
                author: '',
                artworkUrl: null,
                customArtworkUrl: row.custom_artwork_url,
                description: '',
                category: null,
                unread: 0,
                isPrivate: true
              }
              return { podcast, episodes: [] }
            }
            authHeader = basicAuthHeader(credential.user, credential.password)
          }

          try {
            const parsed = await parseFeed(row.feed_url, row.id, authHeader)
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
              isPrivate: row.is_private
            }

            const priorMark = lastSeen[row.id]
            if (priorMark) {
              for (const e of episodes) {
                if (!e.played && e.pubDateIso > priorMark) newEpisodes.push(e)
              }
            }
            const newestPubDate = episodes.reduce((max, e) => (e.pubDateIso > max ? e.pubDateIso : max), '')
            if (newestPubDate) lastSeen[row.id] = newestPubDate

            return { podcast, episodes }
          } catch (err) {
            console.error(`Failed to load feed ${row.feed_url}:`, err)
            return null
          }
        },
        mergeFeed
      )

      set({ privateFeedsMissingCredential: missingCredential })

      await saveLastSeenMap(lastSeen)
      if (newEpisodes.length > 0) {
        const existingQueue = get().queue
        const existingSet = new Set(existingQueue)
        const toAdd = newEpisodes
          .filter((e) => !existingSet.has(e.id))
          .sort((a, b) => (a.pubDateIso < b.pubDateIso ? -1 : 1))
          .map((e) => e.id)
        if (toAdd.length > 0) {
          const nextQueue = [...existingQueue, ...toAdd]
          set({ queue: nextQueue })
          await saveQueue(nextQueue)
          console.log(`[loadLibrary] auto-queued ${toAdd.length} new episode(s)`)
        }
      }

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
  // applyUnsubscribeCascade): drop the podcast locally, tombstone it
  // remotely, strip its episodes out of the queue, and strip its id out of
  // any category (Station) it belonged to.
  unsubscribe: async (podcastId) => {
    const userId = await currentUserId()
    if (!userId) return
    const isPrivate = get().podcasts.find((p) => p.id === podcastId)?.isPrivate ?? false
    const removedEpisodeIds = new Set((get().episodesByPodcast[podcastId] ?? []).map((e) => e.id))
    const previousQueue = get().queue
    const nextQueue = previousQueue.filter((id) => !removedEpisodeIds.has(id))
    const queueChanged = nextQueue.length !== previousQueue.length
    const affectedStationIds = get()
      .stations.filter((s) => s.podcastIds.includes(podcastId))
      .map((s) => s.id)
    set((state) => {
      const { [podcastId]: _removedFeed, ...restPrivateFeeds } = state.privateFeeds
      const { [podcastId]: _removedMissing, ...restMissing } = state.privateFeedsMissingCredential
      return {
        podcasts: state.podcasts.filter((p) => p.id !== podcastId),
        episodesByPodcast: Object.fromEntries(
          Object.entries(state.episodesByPodcast).filter(([id]) => id !== podcastId)
        ),
        queue: nextQueue,
        privateFeeds: restPrivateFeeds,
        privateFeedsMissingCredential: restMissing
      }
    })
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
    if (isPrivate) {
      // Mirrors desktop's removePrivateFeed: the podcast row and the
      // private_feeds identity row are two separate synced rows for the
      // same feed, so both need a tombstone or the identity would dangle
      // on every other device. The credential only ever lived on this
      // device, so it's just deleted, not synced anywhere.
      try {
        unwrap(
          await supabase
            .from('private_feeds')
            .upsert({ user_id: userId, id: podcastId, deleted_at: now, updated_at: now })
        )
      } catch (err) {
        console.error(`[unsubscribe] private_feeds tombstone failed for ${podcastId}:`, err)
      }
      await deletePrivateFeedCredential(podcastId)
    }
    if (queueChanged) await saveQueue(nextQueue)
    // Mirrors the desktop app's unsubscribe cascade: an unsubscribed show
    // shouldn't linger as a dangling id in a category (Station) that can
    // never resolve to anything.
    await Promise.all(affectedStationIds.map((id) => get().removePodcastFromCategory(id, podcastId)))
  },

  // Validates the credentials work, saves the password to this device's
  // secure storage only (never synced — see lib/privateFeedCredentials.ts),
  // and syncs the identity (name/url/user, no password) plus a podcast row
  // marked isPrivate so it shows up in the Library like any other show.
  addPrivateFeed: async (rawUrl, rawUser, password) => {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not signed in')
    const url = rawUrl.trim()
    const user = rawUser.trim()
    if (!url || !user || !password) throw new Error('URL, username, and password are all required')

    const id = await hashId(url)
    const authHeader = basicAuthHeader(user, password)
    const parsed = await parseFeed(url, id, authHeader)
    const name = parsed.name || url.replace(/^https?:\/\//, '').split('/')[0]

    await savePrivateFeedCredential(id, user, password)

    const now = new Date().toISOString()
    unwrap(
      await supabase.from('podcasts').upsert({
        user_id: userId,
        id,
        feed_url: url,
        is_private: true,
        custom_artwork_url: null,
        updated_at: now,
        deleted_at: null
      })
    )
    unwrap(
      await supabase.from('private_feeds').upsert({
        user_id: userId,
        id,
        name,
        url,
        feed_user: user,
        updated_at: now,
        deleted_at: null
      })
    )

    await get().loadLibrary()
  },

  // For a private feed synced from another device with no local
  // credential yet (see privateFeedsMissingCredential) — just saves the
  // password and re-loads, reusing loadLibrary's existing fetch path
  // rather than duplicating it here.
  retryPrivateFeedCredential: async (feedId, user, password) => {
    const url = get().privateFeeds[feedId]?.url
    if (!url) throw new Error('Unknown private feed')
    const authHeader = basicAuthHeader(user.trim(), password)
    await parseFeed(url, feedId, authHeader)
    await savePrivateFeedCredential(feedId, user.trim(), password)
    await get().loadLibrary()
  },

  setNotify: async (podcastId, notify) => {
    const previous = get().podcastSettings[podcastId]?.notify ?? false
    set((state) => ({
      podcastSettings: { ...state.podcastSettings, [podcastId]: { notify } }
    }))
    const userId = await currentUserId()
    if (!userId) return
    try {
      unwrap(
        await supabase.from('podcast_settings').upsert({
          user_id: userId,
          podcast_id: podcastId,
          notify,
          updated_at: new Date().toISOString()
        })
      )
    } catch (err) {
      console.error(`[notify] save failed for ${podcastId}:`, err)
      set((state) => ({
        podcastSettings: { ...state.podcastSettings, [podcastId]: { notify: previous } }
      }))
      throw err
    }
  },

  savePosition: async (episodeId, positionSec) => {
    const next = { ...get().positions, [episodeId]: positionSec }
    set({ positions: next })
    // Written to disk immediately and independently of the network call
    // below — this is what makes a same-device close/reopen resume
    // correctly even if the Supabase write below is slow, fails, or never
    // gets the chance to run before the app is killed.
    saveLocalPositions(next).catch(() => {})
    const userId = await currentUserId()
    if (!userId) return
    try {
      unwrap(
        await supabase.from('playback_positions').upsert({
          user_id: userId,
          episode_id: episodeId,
          position_sec: positionSec,
          updated_at: new Date().toISOString()
        })
      )
    } catch (err) {
      // Was silently swallowed before (an unhandled rejection from the
      // AudioEngine save interval, since nothing there awaited or caught
      // this) — a failed save here is exactly what "acts like I never
      // listened to it" looks like, so it needs to be visible.
      console.error(`[position] save failed for ${episodeId}:`, err)
    }
  },

  fetchLatestPosition: async (episodeId) => {
    const userId = await currentUserId()
    if (!userId) return null
    try {
      const { data, error } = await supabase
        .from('playback_positions')
        .select('position_sec')
        .eq('user_id', userId)
        .eq('episode_id', episodeId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const sec = data?.position_sec ?? null
      if (sec !== null) set((state) => ({ positions: { ...state.positions, [episodeId]: sec } }))
      return sec
    } catch (err) {
      console.error(`[position] fetch latest failed for ${episodeId}:`, err)
      return null
    }
  },

  refreshPositions: async () => {
    const userId = await currentUserId()
    if (!userId) return
    try {
      const [positionRows, queueResult] = await Promise.all([
        fetchAllRows<{ episode_id: string; position_sec: number }>((from, to) =>
          supabase
            .from('playback_positions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .range(from, to)
        ),
        supabase.from('queue').select('*').eq('user_id', userId).maybeSingle()
      ])
      const positions: Record<string, number> = {}
      for (const row of positionRows) positions[row.episode_id] = row.position_sec
      const queueRow = unwrap(queueResult)
      const queue: string[] = Array.isArray(queueRow?.episode_ids) ? queueRow.episode_ids : []
      set((state) => {
        const merged = { ...state.positions, ...positions }
        saveLocalPositions(merged).catch(() => {})
        return { positions: merged, queue }
      })
    } catch (err) {
      console.error('[refreshPositions] failed:', err)
    }
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
    try {
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
    } catch (err) {
      console.error(`[markAllPlayed] save failed for ${podcastId}:`, err)
      throw err
    }

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
      const podcast = get().podcasts.find((p) => p.id === episode.podcastId)
      let authHeader: string | undefined
      if (podcast?.isPrivate) {
        const credential = await getPrivateFeedCredential(episode.podcastId)
        if (credential) authHeader = basicAuthHeader(credential.user, credential.password)
      }
      const uri = await downloadEpisodeFile(episode.id, episode.audioUrl, authHeader)
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

  loadStations: async () => {
    const userId = await currentUserId()
    if (!userId) return
    try {
      const rows = await fetchAllRows<StationRow>((from, to) =>
        supabase
          .from('stations')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .is('deleted_at', null)
          .range(from, to)
      )
      const validSorts = new Set(['newest', 'oldest', 'shortest', 'longest'])
      const stations: Station[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        podcastIds: Array.isArray(row.podcast_ids) ? row.podcast_ids : [],
        sortBy: validSorts.has(row.sort_by) ? (row.sort_by as Station['sortBy']) : 'newest',
        episodesPerShow: typeof row.episodes_per_show === 'number' ? row.episodes_per_show : 5
      }))
      set({ stations, stationsLoaded: true })
    } catch (err) {
      console.error('[stations] load failed:', err)
      set({ stationsLoaded: true })
    }
  },

  createCategory: async (name) => {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not signed in')
    const id = await hashId(`${name}-${Date.now()}-${Math.random()}`)
    const station: Station = { id, name, podcastIds: [], sortBy: 'newest', episodesPerShow: 5 }
    try {
      await upsertStation(userId, station)
    } catch (err) {
      console.error(`[categories] create failed for "${name}":`, err)
      throw err
    }
    set((state) => ({ stations: [...state.stations, station] }))
    return station
  },

  renameCategory: async (stationId, name) => {
    const userId = await currentUserId()
    if (!userId) return
    const station = get().stations.find((s) => s.id === stationId)
    if (!station) return
    const updated: Station = { ...station, name }
    try {
      await upsertStation(userId, updated)
    } catch (err) {
      console.error(`[categories] rename failed for ${stationId}:`, err)
      throw err
    }
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
  },

  deleteCategory: async (stationId) => {
    const userId = await currentUserId()
    if (!userId) return
    const previous = get().stations
    set((state) => ({ stations: state.stations.filter((s) => s.id !== stationId) }))
    const now = new Date().toISOString()
    try {
      unwrap(
        await supabase.from('stations').upsert({ user_id: userId, id: stationId, deleted_at: now, updated_at: now })
      )
    } catch (err) {
      console.error(`[categories] delete failed for ${stationId}:`, err)
      set({ stations: previous })
      throw err
    }
  },

  addPodcastToCategory: async (stationId, podcastId) => {
    const userId = await currentUserId()
    if (!userId) return
    const station = get().stations.find((s) => s.id === stationId)
    if (!station || station.podcastIds.includes(podcastId)) return
    const updated: Station = { ...station, podcastIds: [...station.podcastIds, podcastId] }
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
    try {
      await upsertStation(userId, updated)
    } catch (err) {
      console.error(`[categories] add podcast failed for ${stationId}:`, err)
      throw err
    }
  },

  removePodcastFromCategory: async (stationId, podcastId) => {
    const userId = await currentUserId()
    if (!userId) return
    const station = get().stations.find((s) => s.id === stationId)
    if (!station) return
    const updated: Station = { ...station, podcastIds: station.podcastIds.filter((id) => id !== podcastId) }
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
    try {
      await upsertStation(userId, updated)
    } catch (err) {
      console.error(`[categories] remove podcast failed for ${stationId}:`, err)
      throw err
    }
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

// Coming back to the foreground is exactly the moment listening may have
// happened elsewhere (put the phone down, picked up the iPad) — re-pull
// positions/queue then so Continue Listening, queue progress bars, and the
// Sidebar don't keep showing whatever was true when this device's app was
// last opened.
RNAppState.addEventListener('change', (next) => {
  if (next !== 'active') return
  const state = useStore.getState()
  if (state.signedIn && state.libraryLoaded) state.refreshPositions()
})
