import { create } from 'zustand'
import { AppState as RNAppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Podcast, Episode, PodcastSettings, Station, PrivateFeed } from '@shared/types'
import type { DiscoverPodcast } from '@shared/types'
import { nextInQueue, previousInQueue } from '@shared/queueView'
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
// detect genuinely new episodes for auto-queueing. Cached here locally so a
// same-device reload doesn't need a round trip just to know what it already
// saw, but the source of truth is the synced counterpart in
// podcast_settings.last_seen_pub_date (merged in loadLibrary as
// `remoteLastSeen`) — a purely local mark used to let a device that hadn't
// loaded its library in a while re-treat an already-handled episode as
// "new" and auto-queue it again, silently un-removing something the user
// (on this device or another) had deliberately taken out of the queue in
// the meantime. Not tracked as full id sets (could grow unbounded for
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

// Local durable cache of the queue, mirroring the local positions cache
// above — the `queue` table's isRemoteNewer gate can reject a pull as
// "not newer than what this device already knows" (correctly, protecting
// an edit still in flight), but before this cache existed the merge's
// fallback for a rejected pull was `state.queue`, which on a cold app start
// is always the freshly-initialized `[]` — so a rejected pull on reopen
// showed an empty queue instead of the last real one, even though nothing
// was actually wrong server-side. Now the fallback is this durable cache
// instead of whatever happens to be in fresh in-memory state.
const QUEUE_STORAGE_KEY = 'empirepod.queue.v1'

async function loadLocalQueue(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch (err) {
    console.error('[queue] local load failed:', err)
    return []
  }
}

async function saveLocalQueue(queue: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
  } catch (err) {
    console.error('[queue] local save failed:', err)
  }
}

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

function maxIsoDate(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

async function saveLastSeenMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(map))
  } catch (err) {
    console.error('[autoQueue] save failed:', err)
  }
}

// Mirrors the desktop app's syncUpdatedAt/isRemoteNewer ledger
// (src/main/sync/sync.ts) — mobile previously had no equivalent, so every
// pull (loadLibrary, refreshPositions, fetchLatestPosition) blindly trusted
// whatever the server returned, even a row older than an edit this device
// already made but hadn't finished uploading. That's what let a quick
// background/foreground cycle silently roll back a just-made position/queue/
// played-state change: the edit landed locally, the app foregrounded before
// the upload finished, and the resulting fetch overwrote it with the
// stale pre-edit server row. Keyed the same way as desktop
// ('playbackPosition:<id>', 'episodePlayed:<id>', 'queue') so the concept —
// "don't accept a remote row unless it's actually newer than what this
// device already knows" — matches exactly, just persisted to AsyncStorage
// instead of the main process's disk-backed snapshot.
const SYNC_LEDGER_STORAGE_KEY = 'empirepod.syncLedger.v1'
let syncLedger: Record<string, number> = {}
// A promise, not a boolean: a plain "already loaded" flag set synchronously
// before the AsyncStorage read completes would let a second concurrent
// caller see it as already-loaded and start comparing against the still-
// empty `syncLedger` while the first call's read is still in flight. Every
// caller awaiting the same promise ensures nobody proceeds until the read
// actually finishes, no matter how many call this before the first resolves.
let syncLedgerLoadPromise: Promise<void> | null = null

function ensureSyncLedgerLoaded(): Promise<void> {
  if (syncLedgerLoadPromise) return syncLedgerLoadPromise
  syncLedgerLoadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(SYNC_LEDGER_STORAGE_KEY)
      // Merged rather than replaced: in the unlikely case a touchSync fires
      // before this read resolves, a plain overwrite here would silently
      // discard it. Keys already in `syncLedger` (from such a touch) win
      // over the loaded snapshot, since they're strictly newer.
      if (raw) syncLedger = { ...(JSON.parse(raw) as Record<string, number>), ...syncLedger }
    } catch (err) {
      console.error('[sync] ledger load failed:', err)
    }
  })()
  return syncLedgerLoadPromise
}

// Stamped at the moment of a local edit (default `Date.now()`), independent
// of whether the matching network write actually succeeds — an edit this
// device just made is authoritative from this device's point of view
// whether or not it's reached the server yet, and should resist being
// overwritten by a pull that only reflects the pre-edit state. Also called
// with a remote row's own `updated_at` when a pull is accepted, so the next
// comparison has an up-to-date baseline.
function touchSync(key: string, ms: number = Date.now()): void {
  syncLedger[key] = ms
  AsyncStorage.setItem(SYNC_LEDGER_STORAGE_KEY, JSON.stringify(syncLedger)).catch((err) => {
    console.error('[sync] ledger save failed:', err)
  })
}

// Undoes a touchSync when the write it was protecting turned out to fail —
// otherwise a permanently-failed upload would leave the ledger claiming
// "this device knows about an edit as of just now" forever, which could
// block a genuinely newer value from a different device that legitimately
// won the same window from ever being accepted.
function revertSync(key: string, previousMs: number | undefined): void {
  if (previousMs === undefined) delete syncLedger[key]
  else syncLedger[key] = previousMs
  AsyncStorage.setItem(SYNC_LEDGER_STORAGE_KEY, JSON.stringify(syncLedger)).catch((err) => {
    console.error('[sync] ledger save failed:', err)
  })
}

function isRemoteNewer(key: string, remoteUpdatedAtIso: string | null | undefined): boolean {
  if (!remoteUpdatedAtIso) return true
  const remoteMs = new Date(remoteUpdatedAtIso).getTime()
  return remoteMs > (syncLedger[key] ?? 0)
}

// Tracks an in-flight refreshPositions() call so rapid background/foreground
// toggling coalesces into the same fetch instead of firing overlapping ones.
let refreshPositionsInFlight: Promise<void> | null = null

// Live subscriptions started by subscribeRealtime(), torn down by
// unsubscribeRealtime() — module-scoped rather than in Zustand state since
// these are side-effect handles, not data the UI ever reads.
let realtimeChannels: RealtimeChannel[] = []

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

  // Set by the NetInfo listener wired up at the bottom of this file — every
  // write action already fails silently past a console.error with no
  // network, which reads as "the button didn't work" with nothing to tell
  // the user why. Surfacing this lets the UI show an explicit "you're
  // offline" state instead of a mysteriously inert app.
  isOffline: boolean

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

  // Live cross-device sync for the three tables that were previously
  // poll-only (loadLibrary on open, refreshPositions on foreground) — a
  // second device's edit now arrives while this one stays open, instead of
  // only becoming visible after this device backgrounds/foregrounds or
  // reloads its library. Requires playback_positions/queue/episode_played
  // to actually be enabled for Realtime in the Supabase dashboard (Database
  // > Replication) — the subscription is silently a no-op otherwise, same
  // as any Supabase Realtime channel with nothing published to it. Every
  // incoming row still goes through the same isRemoteNewer gate as a
  // regular pull, so this device's own writes (which the channel echoes
  // back) never re-apply themselves.
  subscribeRealtime: () => Promise<void>
  unsubscribeRealtime: () => void

  // Hydrates `positions` from this device's local cache before anything
  // else has loaded — called once at startup (see App.tsx), same as
  // loadSettings, so a position saved just before this device's app was
  // last closed is available immediately instead of waiting on loadLibrary's
  // network round trip.
  loadCachedPositions: () => Promise<void>
  // Same idea, for the queue — hydrates `queue` from this device's local
  // cache before the network pull lands, so a rejected/slow pull on cold
  // start falls back to the last real queue instead of the empty initial
  // state. See QUEUE_STORAGE_KEY's doc comment.
  loadCachedQueue: () => Promise<void>
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
  // Queue-relative transport, same as desktop's playNextInQueue/
  // playPreviousInQueue (NowPlayingPanel.tsx) — a no-op when there's
  // nothing to skip to, so callers can wire these straight to a button's
  // onPress without checking first.
  playNextInQueue: () => void
  playPreviousInQueue: () => void
}

async function saveQueue(episodeIds: string[]): Promise<void> {
  await ensureSyncLedgerLoaded()
  // Written to disk immediately, independent of the network call below —
  // same reasoning as savePosition's saveLocalPositions: this is what makes
  // a same-device close/reopen show the right queue even if the write below
  // is slow, fails, or never gets the chance to run before the app closes.
  saveLocalQueue(episodeIds).catch(() => {})
  // Stamped before the network call even starts (see touchSync's doc
  // comment) — every caller sets `queue` locally right before calling this,
  // so this covers addToQueue/removeFromQueue/reorderQueue/loadLibrary's
  // auto-queue in one place.
  const previousLedgerMs = syncLedger.queue
  touchSync('queue')
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
    revertSync('queue', previousLedgerMs)
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
  isOffline: false,

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

  loadCachedQueue: async () => {
    const cached = await loadLocalQueue()
    set({ queue: cached })
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
      await ensureSyncLedgerLoaded()
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
        fetchAllRows<{ episode_id: string; position_sec: number; updated_at: string }>((from, to) =>
          supabase
            .from('playback_positions')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .range(from, to)
        ),
        fetchAllRows<{ episode_id: string; played: boolean; updated_at: string }>((from, to) =>
          supabase
            .from('episode_played')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .range(from, to)
        ),
        fetchAllRows<{ podcast_id: string; notify: boolean; last_seen_pub_date: string | null }>((from, to) =>
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

      // Per-key gated by the sync ledger (see isRemoteNewer's doc comment):
      // a server row only overwrites what this device already knows if it's
      // actually newer than the last edit/pull this device recorded for
      // that key. A row that fails the gate is simply left out of these
      // objects, so the merges below fall through to whatever's already in
      // state — a position/queue edit this device made but hasn't finished
      // uploading yet survives instead of being silently rolled back by a
      // fetch that only reflects the pre-edit state.
      const positions: Record<string, number> = {}
      for (const row of positionRows) {
        const key = `playbackPosition:${row.episode_id}`
        if (!isRemoteNewer(key, row.updated_at)) continue
        positions[row.episode_id] = row.position_sec
        touchSync(key, new Date(row.updated_at).getTime())
      }

      const playedRowByEpisode = new Map(playedRows.map((r) => [r.episode_id, r]))
      console.log(
        `[loadLibrary] ${playedRows.length} episode_played row(s), ${playedRows.filter((r) => r.played).length} marked played`
      )

      const podcastSettings: Record<string, PodcastSettings> = {}
      // The synced counterpart of `lastSeen` below — see loadLastSeenMap's
      // doc comment for why a per-device-only mark isn't enough.
      const remoteLastSeen: Record<string, string> = {}
      for (const row of settingsRows) {
        podcastSettings[row.podcast_id] = { notify: row.notify }
        if (row.last_seen_pub_date) remoteLastSeen[row.podcast_id] = row.last_seen_pub_date
      }

      const queueRow = unwrap(queueResult)
      const acceptQueue = isRemoteNewer('queue', queueRow?.updated_at)
      const remoteQueue: string[] = Array.isArray(queueRow?.episode_ids) ? queueRow.episode_ids : []
      if (acceptQueue && queueRow?.updated_at) touchSync('queue', new Date(queueRow.updated_at).getTime())

      // Local cache first, remote second: remote wins for any episode it
      // has a newer row for, but a position saved locally on this device
      // that hasn't reached the server yet (offline, or just not pushed at
      // the moment the app closed) must survive this merge rather than
      // being wiped out by a fetch that only reflects the pre-edit state.
      if (acceptQueue) saveLocalQueue(remoteQueue).catch(() => {})
      set((state) => {
        const merged = { ...state.positions, ...positions }
        saveLocalPositions(merged).catch(() => {})
        return {
          positions: merged,
          podcastSettings,
          queue: acceptQueue ? remoteQueue : state.queue,
          privateFeeds
        }
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
      // Podcast ids whose high-water mark advances past what's currently
      // synced to podcast_settings.last_seen_pub_date — pushed once after
      // the loop so every other device shares the advance instead of each
      // device only ever learning about episodes it personally fetched.
      const lastSeenAdvances: Record<string, string> = {}

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
            // Same gate as positions/queue above: only take the server's
            // played value if it's newer than what this device already
            // recorded, otherwise keep this device's own in-memory value
            // (an optimistic setPlayed that hasn't finished uploading
            // shouldn't get reverted by this reload).
            const previousPlayedById = new Map(
              (get().episodesByPodcast[row.id] ?? []).map((e) => [e.id, e.played])
            )
            const episodes = parsed.episodes.map((e) => {
              const playedRow = playedRowByEpisode.get(e.id)
              const key = `episodePlayed:${e.id}`
              if (playedRow && isRemoteNewer(key, playedRow.updated_at)) {
                touchSync(key, new Date(playedRow.updated_at).getTime())
                return { ...e, played: playedRow.played }
              }
              return { ...e, played: previousPlayedById.get(e.id) ?? playedRow?.played ?? false }
            })
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

            // Combines this device's local cache with the synced mark from
            // podcast_settings — whichever is further along — so a device
            // that hasn't loaded its library in a while defers to what
            // another device already established instead of re-treating an
            // already-handled episode as new (see remoteLastSeen's doc
            // comment above LAST_SEEN_STORAGE_KEY).
            const priorMark = maxIsoDate(lastSeen[row.id], remoteLastSeen[row.id])
            if (priorMark) {
              for (const e of episodes) {
                if (!e.played && e.pubDateIso > priorMark) newEpisodes.push(e)
              }
            }
            const newestPubDate = episodes.reduce((max, e) => (e.pubDateIso > max ? e.pubDateIso : max), '')
            if (newestPubDate) {
              lastSeen[row.id] = newestPubDate
              if (newestPubDate > (remoteLastSeen[row.id] ?? '')) lastSeenAdvances[row.id] = newestPubDate
            }

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

      const advanceEntries = Object.entries(lastSeenAdvances)
      if (advanceEntries.length > 0) {
        const now = new Date().toISOString()
        try {
          unwrap(
            await supabase.from('podcast_settings').upsert(
              advanceEntries.map(([podcastId, pubDate]) => ({
                user_id: userId,
                podcast_id: podcastId,
                last_seen_pub_date: pubDate,
                updated_at: now
              }))
            )
          )
        } catch (err) {
          // Non-fatal — this device's local `lastSeen` cache (just saved
          // above) still prevents it from re-treating these episodes as
          // new, only the cross-device advance failed to publish.
          console.error('[autoQueue] failed to sync last-seen watermark:', err)
        }
      }

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

  subscribeRealtime: async () => {
    if (realtimeChannels.length > 0) return
    await ensureSyncLedgerLoaded()
    const userId = await currentUserId()
    if (!userId) return

    const positionsChannel = supabase
      .channel(`rt-positions-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'playback_positions', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as
            | { episode_id: string; position_sec: number; updated_at: string }
            | undefined
          if (!row?.episode_id) return
          const key = `playbackPosition:${row.episode_id}`
          if (!isRemoteNewer(key, row.updated_at)) return
          touchSync(key, new Date(row.updated_at).getTime())
          set((state) => {
            const merged = { ...state.positions, [row.episode_id]: row.position_sec }
            saveLocalPositions(merged).catch(() => {})
            return { positions: merged }
          })
        }
      )
      .subscribe()

    const queueChannel = supabase
      .channel(`rt-queue-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { episode_ids: string[]; updated_at: string } | undefined
          if (!row) return
          if (!isRemoteNewer('queue', row.updated_at)) return
          touchSync('queue', new Date(row.updated_at).getTime())
          const next = Array.isArray(row.episode_ids) ? row.episode_ids : []
          saveLocalQueue(next).catch(() => {})
          set({ queue: next })
        }
      )
      .subscribe()

    const playedChannel = supabase
      .channel(`rt-played-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'episode_played', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as
            | { episode_id: string; podcast_id: string; played: boolean; updated_at: string }
            | undefined
          if (!row?.episode_id) return
          const key = `episodePlayed:${row.episode_id}`
          if (!isRemoteNewer(key, row.updated_at)) return
          touchSync(key, new Date(row.updated_at).getTime())
          set((state) => {
            const episodes = state.episodesByPodcast[row.podcast_id]
            const idx = episodes?.findIndex((e) => e.id === row.episode_id) ?? -1
            if (!episodes || idx === -1) return {}
            const updated = [...episodes]
            updated[idx] = { ...updated[idx], played: row.played }
            return {
              episodesByPodcast: { ...state.episodesByPodcast, [row.podcast_id]: updated },
              podcasts: state.podcasts.map((p) =>
                p.id === row.podcast_id ? { ...p, unread: updated.filter((e) => !e.played).length } : p
              )
            }
          })
        }
      )
      .subscribe()

    realtimeChannels = [positionsChannel, queueChannel, playedChannel]
  },

  unsubscribeRealtime: () => {
    for (const channel of realtimeChannels) supabase.removeChannel(channel)
    realtimeChannels = []
  },

  savePosition: async (episodeId, positionSec) => {
    await ensureSyncLedgerLoaded()
    const next = { ...get().positions, [episodeId]: positionSec }
    set({ positions: next })
    // Written to disk immediately and independently of the network call
    // below — this is what makes a same-device close/reopen resume
    // correctly even if the Supabase write below is slow, fails, or never
    // gets the chance to run before the app is killed.
    saveLocalPositions(next).catch(() => {})
    // Stamped now, before the network call even starts — see touchSync's
    // doc comment. Protects this edit from being rolled back by a
    // loadLibrary/refreshPositions fetch that lands before the upload below
    // finishes (e.g. this device backgrounding right after a save).
    touchSync(`playbackPosition:${episodeId}`)
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
    await ensureSyncLedgerLoaded()
    const userId = await currentUserId()
    if (!userId) return null
    try {
      const { data, error } = await supabase
        .from('playback_positions')
        .select('position_sec, updated_at')
        .eq('user_id', userId)
        .eq('episode_id', episodeId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      // Not newer than what this device already knows (e.g. this device's
      // own recent save hasn't reached the server yet) — returning null
      // here rather than a stale remote value lets the caller fall back to
      // its own local `positions` cache, which the ledger says is already
      // at least as current.
      const key = `playbackPosition:${episodeId}`
      if (!isRemoteNewer(key, data.updated_at)) return null
      touchSync(key, new Date(data.updated_at).getTime())
      const sec = data.position_sec
      set((state) => ({ positions: { ...state.positions, [episodeId]: sec } }))
      return sec
    } catch (err) {
      console.error(`[position] fetch latest failed for ${episodeId}:`, err)
      return null
    }
  },

  refreshPositions: async () => {
    // Guards against overlapping fetches from rapid background/foreground
    // toggling (checking a notification, a quick app-switch) — without
    // this, two in-flight calls race independently and whichever's `set`
    // lands last wins, which is at best wasted work and at worst the
    // shorter-lived one's (possibly staler) result landing after the other.
    if (refreshPositionsInFlight) return refreshPositionsInFlight
    refreshPositionsInFlight = (async () => {
      await ensureSyncLedgerLoaded()
      const userId = await currentUserId()
      if (!userId) return
      try {
        const [positionRows, queueResult] = await Promise.all([
          fetchAllRows<{ episode_id: string; position_sec: number; updated_at: string }>((from, to) =>
            supabase
              .from('playback_positions')
              .select('*', { count: 'exact' })
              .eq('user_id', userId)
              .range(from, to)
          ),
          supabase.from('queue').select('*').eq('user_id', userId).maybeSingle()
        ])
        const positions: Record<string, number> = {}
        for (const row of positionRows) {
          const key = `playbackPosition:${row.episode_id}`
          if (!isRemoteNewer(key, row.updated_at)) continue
          positions[row.episode_id] = row.position_sec
          touchSync(key, new Date(row.updated_at).getTime())
        }
        const queueRow = unwrap(queueResult)
        const acceptQueue = isRemoteNewer('queue', queueRow?.updated_at)
        const remoteQueue: string[] = Array.isArray(queueRow?.episode_ids) ? queueRow.episode_ids : []
        if (acceptQueue && queueRow?.updated_at) touchSync('queue', new Date(queueRow.updated_at).getTime())
        if (acceptQueue) saveLocalQueue(remoteQueue).catch(() => {})
        set((state) => {
          const merged = { ...state.positions, ...positions }
          saveLocalPositions(merged).catch(() => {})
          return { positions: merged, queue: acceptQueue ? remoteQueue : state.queue }
        })
      } catch (err) {
        console.error('[refreshPositions] failed:', err)
      }
    })()
    try {
      await refreshPositionsInFlight
    } finally {
      refreshPositionsInFlight = null
    }
  },

  setPlayed: async (episodeId, podcastId, played) => {
    await ensureSyncLedgerLoaded()
    const key = `episodePlayed:${episodeId}`
    const previousLedgerMs = syncLedger[key]
    let previousPlayed = played
    set((state) => {
      const episodes = (state.episodesByPodcast[podcastId] ?? []).map((e) => {
        if (e.id === episodeId) previousPlayed = e.played
        return e.id === episodeId ? { ...e, played } : e
      })
      return {
        episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: episodes },
        podcasts: state.podcasts.map((p) =>
          p.id === podcastId ? { ...p, unread: episodes.filter((e) => !e.played).length } : p
        )
      }
    })
    // Stamped now, before the network call — protects this edit from being
    // reverted by a loadLibrary that lands before the upload below finishes
    // (see isRemoteNewer's doc comment and loadLibrary's played-state gate).
    touchSync(key)
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
      // Roll back rather than leave this device claiming "played" (or
      // "unplayed") when that never actually reached the server — previously
      // this stayed silently applied only on this device until some later
      // loadLibrary happened to overwrite it back, with no indication to
      // the user that the toggle they saw succeed hadn't actually saved.
      console.error(`[played] save failed for ${episodeId}:`, err)
      revertSync(key, previousLedgerMs)
      set((state) => {
        const episodes = (state.episodesByPodcast[podcastId] ?? []).map((e) =>
          e.id === episodeId ? { ...e, played: previousPlayed } : e
        )
        return {
          episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: episodes },
          podcasts: state.podcasts.map((p) =>
            p.id === podcastId ? { ...p, unread: episodes.filter((e) => !e.played).length } : p
          )
        }
      })
      throw err
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

    const updatedAtMs = new Date(updatedAt).getTime()
    for (const e of unplayed) touchSync(`episodePlayed:${e.id}`, updatedAtMs)

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
    const previous = get().queue
    const next = [...previous, episodeId]
    set({ queue: next })
    try {
      await saveQueue(next)
    } catch (err) {
      // Roll back rather than leave this device showing a queue the server
      // never received — otherwise the episode looks added here but is
      // silently missing again on any other device, with nothing to
      // indicate the add didn't actually persist.
      set((state) => ({ queue: state.queue === next ? previous : state.queue }))
      throw err
    }
  },

  removeFromQueue: async (episodeId) => {
    const previous = get().queue
    const next = previous.filter((id) => id !== episodeId)
    set({ queue: next })
    try {
      await saveQueue(next)
    } catch (err) {
      set((state) => ({ queue: state.queue === next ? previous : state.queue }))
      throw err
    }
  },

  reorderQueue: async (episodeIds) => {
    const previous = get().queue
    set({ queue: episodeIds })
    try {
      await saveQueue(episodeIds)
    } catch (err) {
      set((state) => ({ queue: state.queue === episodeIds ? previous : state.queue }))
      throw err
    }
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
  setPlaybackRate: (rate) => set({ playbackRate: rate }),

  playNextInQueue: () => {
    const { queue, currentEpisodeId, loadEpisode } = get()
    const nextId = nextInQueue(queue, currentEpisodeId)
    if (nextId) loadEpisode(nextId, { autoplay: true })
  },
  playPreviousInQueue: () => {
    const { queue, currentEpisodeId, loadEpisode } = get()
    const previousId = previousInQueue(queue, currentEpisodeId)
    if (previousId) loadEpisode(previousId, { autoplay: true })
  }
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

// `isConnected` is `null` briefly on startup before NetInfo has an answer —
// treated as online (not offline) so the app doesn't flash an incorrect
// "you're offline" banner before the first real reading comes in.
NetInfo.addEventListener((state) => {
  useStore.setState({ isOffline: state.isConnected === false })
})
