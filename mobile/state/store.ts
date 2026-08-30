import { create } from 'zustand'
import { AppState as RNAppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import type { Podcast, Episode, PodcastSettings, Station, PrivateFeed } from '@shared/types'
import type { DiscoverPodcast } from '@shared/types'
import { nextInQueue, previousInQueue } from '@shared/queueView'
import {
  createLedgerStore,
  createOutbox,
  getCurrentUserId,
  markerFromUpdatedAt,
  pullAndMerge as enginePullAndMerge,
  subscribeRealtime as engineSubscribeRealtime,
  wireOutboxAutoDrain,
  type LedgerStore,
  type Outbox
} from '@shared/sync/engine'
import { createTableDescriptors, type TableDescriptor, type PodcastRow, type StationRow, type PrivateFeedRow } from '@shared/sync/tables'
import { withAuthRetry, looksLikeAuthError } from '@shared/sync/authRetry'
import { fetchAllRows } from '@shared/sync/paging'
import type { SyncClient } from '@shared/sync/supabaseLike'
import { supabase } from '../lib/supabase'
import { createMobileAdapters } from '../lib/syncAdapters'
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

// Ledger + outbox now live in the shared sync engine (src/shared/sync/) so
// this bookkeeping isn't a second, independently-maintained copy of
// desktop's — see src/main/sync/sync.ts for the same primitives applied to
// the Electron app. Storage key kept as `.v1` (not bumped) since the
// on-disk shape (a plain key -> epoch-ms map) hasn't changed, only where the
// code that reads/writes it lives — an existing user's warm ledger carries
// over rather than every table looking "unseen" after this update.
const SYNC_LEDGER_STORAGE_KEY = 'empirepod.syncLedger.v1'
const SYNC_OUTBOX_STORAGE_KEY = 'empirepod.syncOutbox.v1'

function syncClient(): SyncClient {
  return supabase as unknown as SyncClient
}

let ledger: LedgerStore | null = null
function getLedger(): LedgerStore {
  if (!ledger) ledger = createLedgerStore(createMobileAdapters(syncClient()).storage, SYNC_LEDGER_STORAGE_KEY)
  return ledger
}

let outbox: Outbox | null = null
let stopOutboxAutoDrain: (() => void) | null = null
function getOutbox(): Outbox {
  if (!outbox) {
    const adapters = createMobileAdapters(syncClient())
    outbox = createOutbox(adapters.client, adapters.storage, SYNC_OUTBOX_STORAGE_KEY)
    stopOutboxAutoDrain?.()
    stopOutboxAutoDrain = wireOutboxAutoDrain(outbox, adapters)
  }
  return outbox
}

// Tracks an in-flight refreshPositions() call so rapid background/foreground
// toggling coalesces into the same fetch instead of firing overlapping ones.
let refreshPositionsInFlight: Promise<void> | null = null

// Live subscription handle started by subscribeRealtime(), torn down by
// unsubscribeRealtime() — module-scoped rather than in Zustand state since
// this is a side-effect handle, not data the UI ever reads.
let stopRealtimeSync: (() => void) | null = null

async function currentUserId(): Promise<string | null> {
  return getCurrentUserId(syncClient())
}

// The Supabase JS client never throws on a failed write — it resolves with
// an { error } field instead. Skipping this check (as an earlier version of
// this file did) makes a failed write look identical to a successful one:
// the UI updates optimistically, the database never does, and the change
// silently reverts on the next reload. Still used directly for the handful
// of writes that don't go through the outbox (see markAllPlayed's doc
// comment) — everything else routes through getOutbox().enqueue(), which
// does its own equivalent unwrapping internally.
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
  setPodcastArtwork: (podcastId: string, dataUrl: string | null) => Promise<void>

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
  // Bulk counterpart of removeFromQueue — one queue save for the whole
  // selection instead of N sequential ones, which would otherwise race each
  // other (each computing "next" from a `queue` snapshot that the previous
  // call's own set() may not have landed yet).
  removeManyFromQueue: (episodeIds: string[]) => Promise<void>
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

// Never throws — a failed push stays durably queued in the outbox and keeps
// retrying (on reconnect, foreground, and an interval; see
// lib/syncAdapters.ts) instead of being lost. Callers set `queue` locally
// right before calling this and no longer roll that optimistic state back
// on failure: rolling back here would fight the outbox's own retry, showing
// the user their edit vanish only for the outbox to silently push the very
// change the UI just discarded once the network recovers.
async function saveQueue(episodeIds: string[]): Promise<void> {
  const ledger = getLedger()
  await ledger.ensureLoaded()
  // Written to disk immediately, independent of the network call below —
  // same reasoning as savePosition's saveLocalPositions: this is what makes
  // a same-device close/reopen show the right queue even if the write below
  // is slow, fails, or never gets the chance to run before the app closes.
  saveLocalQueue(episodeIds).catch(() => {})
  // Stamped before the network call even starts (see ledger.touch's doc
  // comment) — every caller sets `queue` locally right before calling this,
  // so this covers addToQueue/removeFromQueue/reorderQueue/loadLibrary's
  // auto-queue in one place.
  ledger.touch('queue')
  const userId = await currentUserId()
  if (!userId) return
  await getOutbox().enqueue('queue', 'queue', { user_id: userId, episode_ids: episodeIds })
}

// Always writes the station's full known row rather than a partial patch —
// simplest way to guarantee sort_by/episodes_per_show (desktop-only station
// settings mobile never edits) survive a mobile-initiated rename or
// membership change unchanged. Previously an unprotected, fire-and-forget
// upsert with no ledger entry at all — a station pull/realtime event could
// clobber an in-flight local rename, and a failed write was lost outright.
// Now goes through the same ledger + outbox pattern as every other table.
async function upsertStation(userId: string, station: Station): Promise<void> {
  const ledger = getLedger()
  await ledger.ensureLoaded()
  ledger.touch(`station:${station.id}`)
  await getOutbox().enqueue('stations', `station:${station.id}`, {
    user_id: userId,
    id: station.id,
    name: station.name,
    podcast_ids: station.podcastIds,
    sort_by: station.sortBy,
    episodes_per_show: station.episodesPerShow,
    deleted_at: null
  })
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

export const useStore = create<AppState>((set, get) => {
  // Shared by loadLibrary's initial pull and subscribeRealtime's live
  // updates — a podcast tombstoned on another device needs the exact same
  // local cleanup (drop it, and strip its episodes out of the queue and any
  // category/Station) whichever path notices it. Previously mobile had no
  // such cascade at all for a REMOTELY-driven removal: loadLibrary's old
  // "final sweep" only dropped the podcast/episodes, leaving stale queue and
  // Station entries dangling on other devices after a remote unsubscribe —
  // this mirrors the local unsubscribe action's own cascade (below), minus
  // re-pushing a tombstone that already exists.
  const applyRemotePodcastTombstone = (podcastId: string): void => {
    const removedEpisodeIds = new Set((get().episodesByPodcast[podcastId] ?? []).map((e) => e.id))
    let nextQueue: string[] | null = null
    set((state) => {
      nextQueue = state.queue.filter((id) => !removedEpisodeIds.has(id))
      const { [podcastId]: _removedFeed, ...restPrivateFeeds } = state.privateFeeds
      const { [podcastId]: _removedMissing, ...restMissing } = state.privateFeedsMissingCredential
      return {
        podcasts: state.podcasts.filter((p) => p.id !== podcastId),
        episodesByPodcast: Object.fromEntries(
          Object.entries(state.episodesByPodcast).filter(([id]) => id !== podcastId)
        ),
        queue: nextQueue,
        stations: state.stations.map((s) =>
          s.podcastIds.includes(podcastId) ? { ...s, podcastIds: s.podcastIds.filter((id) => id !== podcastId) } : s
        ),
        privateFeeds: restPrivateFeeds,
        privateFeedsMissingCredential: restMissing
      }
    })
    if (nextQueue) saveLocalQueue(nextQueue).catch(() => {})
  }

  return {
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
      // Proactively refreshes a session that may have been sitting cached in
      // AsyncStorage since before this device last closed — backgrounded
      // rather than blocking first paint on it. If the refresh itself comes
      // back auth-shaped-broken (e.g. a refresh token minted while this
      // device's clock was wrong, which keeps failing until real time
      // catches up no matter how many times it's retried — see
      // authRetry.ts), the session is unrecoverable on its own: sign out
      // locally so the user gets a clear re-login prompt instead of a
      // permanently-broken cached session failing every sync forever, which
      // is what "JWT issued at future" blocking the Library screen looked
      // like with no recovery path.
      if (result.data.session) {
        supabase.auth.refreshSession().then(({ error }) => {
          if (error && looksLikeAuthError(error)) {
            console.error('[initAuth] session unrecoverable on launch, signing out locally:', error.message)
            supabase.auth.signOut({ scope: 'local' })
          }
        })
      }
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
      const ledger = getLedger()
      await ledger.ensureLoaded()
      const userId = await currentUserId()
      if (!userId) throw new Error('Not signed in')
      const client = syncClient()

      // Buffers filled by the shared engine's applyRow callbacks below, then
      // committed in one `set()` — same single-commit shape as before, now
      // gated uniformly through the shared ledger for every table instead of
      // only positions/queue/episode_played being protected.
      const positions: Record<string, number> = {}
      const podcastSettings: Record<string, PodcastSettings> = {}
      // The synced counterpart of `lastSeen` below — see loadLastSeenMap's
      // doc comment for why a per-device-only mark isn't enough.
      const remoteLastSeen: Record<string, string> = {}
      const privateFeeds: Record<string, PrivateFeed> = {}
      let remoteQueue: string[] | null = null

      const otherDescriptors = createTableDescriptors({
        onPodcastSettingsRow: (row) => {
          podcastSettings[row.podcast_id] = { notify: row.notify }
          if (row.last_seen_pub_date) remoteLastSeen[row.podcast_id] = row.last_seen_pub_date
        },
        onQueueRow: (row) => {
          remoteQueue = Array.isArray(row.episode_ids) ? row.episode_ids : []
        },
        onPlaybackPositionRow: (row) => {
          positions[row.episode_id] = row.position_sec
        },
        onPrivateFeedRow: (row) => {
          privateFeeds[row.id] = {
            id: row.id,
            name: row.name ?? row.url ?? '',
            url: row.url ?? '',
            user: row.feed_user ?? ''
          }
        },
        // A tombstoned identity simply isn't re-added to `privateFeeds`
        // above — the `set()` below replaces the whole map with what was
        // just built, so omitting it here is enough to drop it.
        onPrivateFeedTombstone: () => {}
      })

      // Podcasts and episode_played are pulled separately (not through the
      // generic loop above): podcasts' RSS fetch below needs to fan out with
      // bounded concurrency (see FEED_FETCH_CONCURRENCY), and episode_played
      // rows need to be applied only once their episodes actually exist
      // locally, which doesn't happen until that same RSS fetch completes.
      // Podcasts fetch ALL rows (not filtered to non-deleted) so a tombstone
      // is handled the same explicit way a pull or realtime event handles
      // one everywhere else — see tables.ts's doc comment on deletion.
      const [, rawPodcastRows, playedRows] = await Promise.all([
        enginePullAndMerge(client, ledger, userId, otherDescriptors, markerFromUpdatedAt),
        fetchAllRows<Record<string, unknown>>((from, to) =>
          withAuthRetry(client, () =>
            client.from('podcasts').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
          )
        ),
        fetchAllRows<Record<string, unknown>>((from, to) =>
          withAuthRetry(client, () =>
            client.from('episode_played').select('*', { count: 'exact' }).eq('user_id', userId).range(from, to)
          )
        )
      ])
      const podcastRows = rawPodcastRows as unknown as PodcastRow[]
      const typedPlayedRows = playedRows as unknown as { episode_id: string; played: boolean; updated_at: string }[]
      console.log(`[loadLibrary] ${podcastRows.length} podcast row(s)`)

      for (const row of podcastRows) {
        if (row.deleted_at === null) continue
        const key = `podcast:${row.id}`
        const marker = markerFromUpdatedAt(row)
        if (!ledger.isNewer(key, marker)) continue
        ledger.touch(key, marker)
        applyRemotePodcastTombstone(row.id)
      }
      const activeRows = podcastRows.filter((row) => row.deleted_at === null)

      const playedRowByEpisode = new Map(typedPlayedRows.map((r) => [r.episode_id, r]))
      console.log(
        `[loadLibrary] ${typedPlayedRows.length} episode_played row(s), ${typedPlayedRows.filter((r) => r.played).length} marked played`
      )

      // Local cache first, remote second: remote wins for any episode it
      // has a newer row for, but a position saved locally on this device
      // that hasn't reached the server yet (offline, or just not pushed at
      // the moment the app closed) must survive this merge rather than
      // being wiped out by a fetch that only reflects the pre-edit state.
      if (remoteQueue) saveLocalQueue(remoteQueue).catch(() => {})
      set((state) => {
        const merged = { ...state.positions, ...positions }
        saveLocalPositions(merged).catch(() => {})
        return {
          positions: merged,
          podcastSettings,
          queue: remoteQueue ?? state.queue,
          privateFeeds
        }
      })

      const rowOrder = new Map(activeRows.map((row, i) => [row.id, i]))
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
        activeRows,
        FEED_FETCH_CONCURRENCY,
        async (row) => {
          // Ledger-gated exactly like every other table now (previously
          // podcasts had no protection at all) — an in-flight local edit to
          // custom_artwork_url survives a pull that only reflects the
          // pre-edit row. The RSS fetch/episode merge below still always
          // runs for every active subscription regardless of this gate,
          // since episode content isn't something Supabase has an opinion on.
          const key = `podcast:${row.id}`
          const marker = markerFromUpdatedAt(row)
          const acceptIdentity = ledger.isNewer(key, marker)
          if (acceptIdentity) ledger.touch(key, marker)
          const customArtworkUrl = acceptIdentity
            ? row.custom_artwork_url
            : (get().podcasts.find((p) => p.id === row.id)?.customArtworkUrl ?? null)

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
                customArtworkUrl,
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
              if (playedRow && ledger.isNewer(key, new Date(playedRow.updated_at).getTime())) {
                ledger.touch(key, new Date(playedRow.updated_at).getTime())
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
              customArtworkUrl,
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
            await withAuthRetry(client, () =>
              supabase.from('podcast_settings').upsert(
                advanceEntries.map(([podcastId, pubDate]) => ({
                  user_id: userId,
                  podcast_id: podcastId,
                  last_seen_pub_date: pubDate,
                  updated_at: now
                }))
              )
            )
          )
          for (const [podcastId] of advanceEntries) ledger.touch(`podcastSettings:${podcastId}`, new Date(now).getTime())
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
      // above only ever adds/updates entries for rows that are still there,
      // and applyRemotePodcastTombstone above only fires for a tombstone the
      // ledger accepted as newer. This is a redundant safety net covering
      // any other reason a podcast might be locally present but absent from
      // `activeRows`.
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
    // Kept as a direct, throw-on-failure write (not routed through the
    // outbox) rather than mobile's usual fire-and-forget pattern — the
    // loadLibrary() call right below assumes this podcast now exists in
    // Supabase, so a caller here needs to actually know whether it failed
    // rather than have it silently queued for later while loadLibrary finds
    // nothing new to show.
    unwrap(
      await withAuthRetry(syncClient(), () =>
        supabase.from('podcasts').upsert({
          user_id: userId,
          id: podcast.id,
          feed_url: podcast.feedUrl,
          is_private: false,
          custom_artwork_url: null,
          updated_at: new Date().toISOString(),
          deleted_at: null
        })
      )
    )
    getLedger().touch(`podcast:${podcast.id}`)
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
    const ledger = getLedger()
    await ledger.ensureLoaded()
    ledger.touch(`podcast:${podcastId}`)
    // Routed through the outbox (never rejects — see its doc comment) so a
    // tombstone made while offline durably retries instead of only logging
    // and being lost, which is what the old try/catch-and-log here did.
    await getOutbox().enqueue('podcasts', `podcast:${podcastId}`, {
      user_id: userId,
      id: podcastId,
      deleted_at: now
    })
    if (isPrivate) {
      // Mirrors desktop's removePrivateFeed: the podcast row and the
      // private_feeds identity row are two separate synced rows for the
      // same feed, so both need a tombstone or the identity would dangle
      // on every other device. The credential only ever lived on this
      // device, so it's just deleted, not synced anywhere.
      ledger.touch(`privateFeed:${podcastId}`)
      await getOutbox().enqueue('private_feeds', `privateFeed:${podcastId}`, {
        user_id: userId,
        id: podcastId,
        deleted_at: now
      })
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
    const client = syncClient()
    // Direct, throw-on-failure writes (see subscribe's doc comment for why
    // these two skip the outbox) — loadLibrary() below assumes both rows
    // already exist.
    unwrap(
      await withAuthRetry(client, () =>
        supabase.from('podcasts').upsert({
          user_id: userId,
          id,
          feed_url: url,
          is_private: true,
          custom_artwork_url: null,
          updated_at: now,
          deleted_at: null
        })
      )
    )
    unwrap(
      await withAuthRetry(client, () =>
        supabase.from('private_feeds').upsert({
          user_id: userId,
          id,
          name,
          url,
          feed_user: user,
          updated_at: now,
          deleted_at: null
        })
      )
    )
    const ledger = getLedger()
    ledger.touch(`podcast:${id}`)
    ledger.touch(`privateFeed:${id}`)

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

  // Never rejects (see getOutbox().enqueue's doc comment) — a failed save
  // stays durably queued and keeps retrying instead of the optimistic
  // toggle being rolled back only for the outbox to silently reapply it
  // once the network recovers.
  setNotify: async (podcastId, notify) => {
    set((state) => ({
      podcastSettings: { ...state.podcastSettings, [podcastId]: { notify } }
    }))
    const userId = await currentUserId()
    if (!userId) return
    const ledger = getLedger()
    await ledger.ensureLoaded()
    ledger.touch(`podcastSettings:${podcastId}`)
    await getOutbox().enqueue('podcast_settings', `podcastSettings:${podcastId}`, {
      user_id: userId,
      podcast_id: podcastId,
      notify
    })
  },

  // Mirrors desktop's setPodcastArtwork (src/main/subscriptions.ts): dataUrl
  // is null to clear the override and revert to the feed's own artwork. The
  // caller is expected to have already resized/compressed the image (see
  // lib/imageResize.ts) before it ever reaches here or the outbox.
  setPodcastArtwork: async (podcastId, dataUrl) => {
    set((state) => ({
      podcasts: state.podcasts.map((p) =>
        p.id === podcastId ? { ...p, customArtworkUrl: dataUrl } : p
      )
    }))
    const userId = await currentUserId()
    if (!userId) return
    const ledger = getLedger()
    await ledger.ensureLoaded()
    ledger.touch(`podcast:${podcastId}`)
    await getOutbox().enqueue('podcasts', `podcast:${podcastId}`, {
      user_id: userId,
      id: podcastId,
      custom_artwork_url: dataUrl
    })
  },

  // Wires one Realtime channel per syncable table via the shared engine
  // (src/shared/sync/engine.ts) — previously only playback_positions/queue/
  // episode_played had live updates here; podcasts/podcast_settings/
  // stations/private_feeds only ever caught up on the next full
  // loadLibrary(). `podcasts` specifically defers to loadLibrary() itself
  // (rather than a targeted single-row update like the others) since a new
  // or changed subscription needs the same RSS fetch loadLibrary already
  // knows how to do — duplicating that here isn't worth it for a
  // comparatively rare event.
  subscribeRealtime: async () => {
    if (stopRealtimeSync) return
    const ledger = getLedger()
    await ledger.ensureLoaded()
    const userId = await currentUserId()
    if (!userId) return
    const client = syncClient()

    const descriptors = createTableDescriptors({
      onPodcastRow: () => {
        void get().loadLibrary()
      },
      onPodcastTombstone: (row) => {
        applyRemotePodcastTombstone(row.id)
      },
      onPodcastSettingsRow: (row) => {
        set((state) => ({
          podcastSettings: { ...state.podcastSettings, [row.podcast_id]: { notify: row.notify } }
        }))
      },
      onStationRow: (row) => {
        const station: Station = {
          id: row.id,
          name: row.name ?? 'Untitled Station',
          podcastIds: Array.isArray(row.podcast_ids) ? row.podcast_ids : [],
          sortBy: (['newest', 'oldest', 'shortest', 'longest'] as const).includes(row.sort_by as never)
            ? (row.sort_by as Station['sortBy'])
            : 'newest',
          episodesPerShow: typeof row.episodes_per_show === 'number' ? row.episodes_per_show : 5
        }
        set((state) => ({
          stations: [...state.stations.filter((s) => s.id !== station.id), station]
        }))
      },
      onStationTombstone: (row) => {
        set((state) => ({ stations: state.stations.filter((s) => s.id !== row.id) }))
      },
      onQueueRow: (row) => {
        const next = Array.isArray(row.episode_ids) ? row.episode_ids : []
        saveLocalQueue(next).catch(() => {})
        set({ queue: next })
      },
      onPlaybackPositionRow: (row) => {
        set((state) => {
          const merged = { ...state.positions, [row.episode_id]: row.position_sec }
          saveLocalPositions(merged).catch(() => {})
          return { positions: merged }
        })
      },
      onEpisodePlayedRow: (row) => {
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
      },
      onPrivateFeedRow: (row) => {
        set((state) => ({
          privateFeeds: {
            ...state.privateFeeds,
            [row.id]: {
              id: row.id,
              name: row.name ?? state.privateFeeds[row.id]?.name ?? row.url ?? '',
              url: row.url ?? state.privateFeeds[row.id]?.url ?? '',
              user: row.feed_user ?? state.privateFeeds[row.id]?.user ?? ''
            }
          }
        }))
      },
      onPrivateFeedTombstone: (row) => {
        set((state) => {
          const { [row.id]: _removed, ...rest } = state.privateFeeds
          return { privateFeeds: rest }
        })
      }
    })

    stopRealtimeSync = engineSubscribeRealtime(client, ledger, userId, descriptors, markerFromUpdatedAt)
  },

  unsubscribeRealtime: () => {
    stopRealtimeSync?.()
    stopRealtimeSync = null
  },

  // Never rejects — see getOutbox().enqueue's doc comment. A failed save
  // stays durably queued (retried on reconnect/foreground/interval) instead
  // of being silently lost, which is what the old unhandled-catch-and-log
  // here amounted to.
  savePosition: async (episodeId, positionSec) => {
    const ledger = getLedger()
    await ledger.ensureLoaded()
    const next = { ...get().positions, [episodeId]: positionSec }
    set({ positions: next })
    // Written to disk immediately and independently of the network call
    // below — this is what makes a same-device close/reopen resume
    // correctly even if the Supabase write below is slow, fails, or never
    // gets the chance to run before the app is killed.
    saveLocalPositions(next).catch(() => {})
    // Stamped now, before the network call even starts — see ledger.touch's
    // doc comment. Protects this edit from being rolled back by a
    // loadLibrary/refreshPositions fetch that lands before the upload below
    // finishes (e.g. this device backgrounding right after a save).
    ledger.touch(`playbackPosition:${episodeId}`)
    const userId = await currentUserId()
    if (!userId) return
    await getOutbox().enqueue('playback_positions', `playbackPosition:${episodeId}`, {
      user_id: userId,
      episode_id: episodeId,
      position_sec: positionSec
    })
  },

  fetchLatestPosition: async (episodeId) => {
    const ledger = getLedger()
    await ledger.ensureLoaded()
    const userId = await currentUserId()
    if (!userId) return null
    try {
      const client = syncClient()
      const { data, error } = await withAuthRetry(client, () =>
        supabase
          .from('playback_positions')
          .select('position_sec, updated_at')
          .eq('user_id', userId)
          .eq('episode_id', episodeId)
          .maybeSingle()
      )
      if (error) throw new Error(error.message)
      if (!data) return null
      // Not newer than what this device already knows (e.g. this device's
      // own recent save hasn't reached the server yet) — returning null
      // here rather than a stale remote value lets the caller fall back to
      // its own local `positions` cache, which the ledger says is already
      // at least as current.
      const key = `playbackPosition:${episodeId}`
      const marker = markerFromUpdatedAt(data)
      if (!ledger.isNewer(key, marker)) return null
      ledger.touch(key, marker)
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
      const ledger = getLedger()
      await ledger.ensureLoaded()
      const userId = await currentUserId()
      if (!userId) return
      try {
        const client = syncClient()
        const positions: Record<string, number> = {}
        let remoteQueue: string[] | null = null
        const descriptors = createTableDescriptors({
          onPlaybackPositionRow: (row) => {
            positions[row.episode_id] = row.position_sec
          },
          onQueueRow: (row) => {
            remoteQueue = Array.isArray(row.episode_ids) ? row.episode_ids : []
          }
        })
        await enginePullAndMerge(client, ledger, userId, descriptors, markerFromUpdatedAt)
        if (remoteQueue) saveLocalQueue(remoteQueue).catch(() => {})
        set((state) => {
          const merged = { ...state.positions, ...positions }
          saveLocalPositions(merged).catch(() => {})
          return { positions: merged, queue: remoteQueue ?? state.queue }
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

  // Never rejects — see getOutbox().enqueue's doc comment. No longer rolls
  // the optimistic played-state back on a save failure: the write stays
  // durably queued and retries instead, so the toggle the user saw succeed
  // doesn't flip back only for the outbox to silently reapply it later.
  setPlayed: async (episodeId, podcastId, played) => {
    const ledger = getLedger()
    await ledger.ensureLoaded()
    const key = `episodePlayed:${episodeId}`
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
    // Stamped now, before the network call — protects this edit from being
    // reverted by a loadLibrary that lands before the upload below finishes
    // (see ledger.isNewer's doc comment and loadLibrary's played-state gate).
    ledger.touch(key)
    const userId = await currentUserId()
    if (!userId) return
    await getOutbox().enqueue('episode_played', key, {
      user_id: userId,
      episode_id: episodeId,
      podcast_id: podcastId,
      played
    })
  },

  // One batched upsert for the whole show rather than one request per
  // episode (the desktop sync's initial push made the same mistake at scale
  // before being fixed to batch) — bypasses the outbox's one-payload-per-key
  // shape for this reason, wrapped in withAuthRetry directly instead. Still
  // throws on failure (unlike the per-episode actions above): this is a
  // deliberate, one-off bulk action the user is actively waiting on, not a
  // steady-state background save, so immediate feedback is the right call.
  markAllPlayed: async (podcastId) => {
    const episodes = get().episodesByPodcast[podcastId] ?? []
    const unplayed = episodes.filter((e) => !e.played)
    if (unplayed.length === 0) return

    const userId = await currentUserId()
    if (!userId) return
    const updatedAt = new Date().toISOString()
    try {
      unwrap(
        await withAuthRetry(syncClient(), () =>
          supabase.from('episode_played').upsert(
            unplayed.map((e) => ({
              user_id: userId,
              episode_id: e.id,
              podcast_id: podcastId,
              played: true,
              updated_at: updatedAt
            }))
          )
        )
      )
    } catch (err) {
      console.error(`[markAllPlayed] save failed for ${podcastId}:`, err)
      throw err
    }

    const ledger = getLedger()
    const updatedAtMs = new Date(updatedAt).getTime()
    for (const e of unplayed) ledger.touch(`episodePlayed:${e.id}`, updatedAtMs)

    set((state) => {
      const updated = (state.episodesByPodcast[podcastId] ?? []).map((e) => ({ ...e, played: true }))
      return {
        episodesByPodcast: { ...state.episodesByPodcast, [podcastId]: updated },
        podcasts: state.podcasts.map((p) => (p.id === podcastId ? { ...p, unread: 0 } : p))
      }
    })
  },

  // saveQueue never rejects (durable outbox — see its doc comment), so
  // there's nothing to roll back to here anymore: the optimistic queue
  // state IS what gets pushed, eventually, no matter how long that takes.
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

  removeManyFromQueue: async (episodeIds) => {
    if (episodeIds.length === 0) return
    const toRemove = new Set(episodeIds)
    const next = get().queue.filter((id) => !toRemove.has(id))
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
    const ledger = getLedger()
    await ledger.ensureLoaded()
    const userId = await currentUserId()
    if (!userId) return
    try {
      const client = syncClient()
      const stationsById = new Map(get().stations.map((s) => [s.id, s]))
      const descriptors = createTableDescriptors({
        onStationRow: (row) => {
          stationsById.set(row.id, {
            id: row.id,
            name: row.name ?? 'Untitled Station',
            podcastIds: Array.isArray(row.podcast_ids) ? row.podcast_ids : [],
            sortBy: (['newest', 'oldest', 'shortest', 'longest'] as const).includes(row.sort_by as never)
              ? (row.sort_by as Station['sortBy'])
              : 'newest',
            episodesPerShow: typeof row.episodes_per_show === 'number' ? row.episodes_per_show : 5
          })
        },
        onStationTombstone: (row) => {
          stationsById.delete(row.id)
        }
      })
      await enginePullAndMerge(client, ledger, userId, descriptors, markerFromUpdatedAt)
      set({ stations: Array.from(stationsById.values()), stationsLoaded: true })
    } catch (err) {
      console.error('[stations] load failed:', err)
      set({ stationsLoaded: true })
    }
  },

  // upsertStation routes through the shared outbox (never rejects — see its
  // doc comment), so every category action below is optimistic-and-durable
  // rather than throw-and-roll-back: the local state IS what eventually
  // reaches the server, no matter how long a flaky connection takes.
  createCategory: async (name) => {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not signed in')
    const id = await hashId(`${name}-${Date.now()}-${Math.random()}`)
    const station: Station = { id, name, podcastIds: [], sortBy: 'newest', episodesPerShow: 5 }
    set((state) => ({ stations: [...state.stations, station] }))
    await upsertStation(userId, station)
    return station
  },

  renameCategory: async (stationId, name) => {
    const userId = await currentUserId()
    if (!userId) return
    const station = get().stations.find((s) => s.id === stationId)
    if (!station) return
    const updated: Station = { ...station, name }
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
    await upsertStation(userId, updated)
  },

  deleteCategory: async (stationId) => {
    const userId = await currentUserId()
    if (!userId) return
    set((state) => ({ stations: state.stations.filter((s) => s.id !== stationId) }))
    const ledger = getLedger()
    await ledger.ensureLoaded()
    ledger.touch(`station:${stationId}`)
    await getOutbox().enqueue('stations', `station:${stationId}`, {
      user_id: userId,
      id: stationId,
      deleted_at: new Date().toISOString()
    })
  },

  addPodcastToCategory: async (stationId, podcastId) => {
    const userId = await currentUserId()
    if (!userId) return
    const station = get().stations.find((s) => s.id === stationId)
    if (!station || station.podcastIds.includes(podcastId)) return
    const updated: Station = { ...station, podcastIds: [...station.podcastIds, podcastId] }
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
    await upsertStation(userId, updated)
  },

  removePodcastFromCategory: async (stationId, podcastId) => {
    const userId = await currentUserId()
    if (!userId) return
    const station = get().stations.find((s) => s.id === stationId)
    if (!station) return
    const updated: Station = { ...station, podcastIds: station.podcastIds.filter((id) => id !== podcastId) }
    set((state) => ({ stations: state.stations.map((s) => (s.id === stationId ? updated : s)) }))
    await upsertStation(userId, updated)
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
  }
})

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
