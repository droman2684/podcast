import type { StateCreator } from 'zustand'
import type { SyncPhase, SyncDataChangedPayload } from '@shared/ipcChannels'
import type { AppState } from '../store'

export type AuthStep = 'signedOut' | 'signedIn'

export interface AuthSlice {
  showAccountModal: boolean
  authStep: AuthStep
  authEmail: string | null
  authError: string | null
  authBusy: boolean
  syncPhase: SyncPhase
  syncLastSyncedAt: number | null
  syncError: string | null
  openAccountModal: () => void
  closeAccountModal: () => void
  initAuth: () => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOutOfSync: () => Promise<void>
  syncNow: () => Promise<void>
  reloadAfterRemoteChange: (payload: SyncDataChangedPayload) => Promise<void>
}

// Guards module-level (same pattern as initSubscriptionUpdates) so React
// StrictMode's double-invoke never registers the IPC listeners twice.
let authUpdatesInitialized = false

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  showAccountModal: false,
  authStep: 'signedOut',
  authEmail: null,
  authError: null,
  authBusy: false,
  syncPhase: 'idle',
  syncLastSyncedAt: null,
  syncError: null,

  openAccountModal: () => set({ showAccountModal: true, authError: null }),
  closeAccountModal: () => set({ showAccountModal: false }),

  initAuth: async () => {
    if (!authUpdatesInitialized) {
      authUpdatesInitialized = true
      window.api.auth.onStateChanged((state) => {
        set({
          authStep: state.signedIn ? 'signedIn' : 'signedOut',
          authEmail: state.email
        })
      })
      window.api.sync.onState((payload) => {
        set({
          syncPhase: payload.phase,
          syncLastSyncedAt: payload.lastSyncedAt,
          syncError: payload.error ?? null
        })
      })
      window.api.sync.onDataChanged((payload) => {
        get()
          .reloadAfterRemoteChange(payload)
          .catch((err) => console.error('Failed to reload after sync:', err))
      })
    }
    const state = await window.api.auth.getState()
    set({ authStep: state.signedIn ? 'signedIn' : 'signedOut', authEmail: state.email })
  },

  signUp: async (email, password) => {
    set({ authBusy: true, authError: null })
    try {
      await window.api.auth.signUpWithPassword(email, password)
      set({ authStep: 'signedIn', authEmail: email, authBusy: false })
      await get().syncNow()
    } catch (err) {
      set({ authBusy: false, authError: err instanceof Error ? err.message : String(err) })
    }
  },

  signIn: async (email, password) => {
    set({ authBusy: true, authError: null })
    try {
      await window.api.auth.signInWithPassword(email, password)
      set({ authStep: 'signedIn', authEmail: email, authBusy: false })
      await get().syncNow()
    } catch (err) {
      set({ authBusy: false, authError: err instanceof Error ? err.message : String(err) })
    }
  },

  signOutOfSync: async () => {
    await window.api.auth.signOut()
    set({ authStep: 'signedOut', authEmail: null })
  },

  // Runs the cloud sync cycle, then reloads every domain slice from main the
  // same way hydrateApp() does on startup — a pulled change made on another
  // device only shows up here once this reload runs, since (unlike RSS
  // refreshes) a background sync cycle has no live push into the renderer.
  syncNow: async () => {
    await window.api.sync.now()
    await get().loadSubscriptions()
    await Promise.all([
      get().loadQueue(),
      get().loadQueuePrefs(),
      get().loadPrivateFeeds(),
      get().loadStations(),
      get().loadPositions()
    ])
    await Promise.all(get().podcasts.map((p) => get().loadEpisodes(p.id)))
  },

  // Pushed from main whenever a background pull or realtime event applied
  // another device's changes (see main/sync/sync.ts noteRemoteChange).
  // Reloads only what those tables touch rather than everything syncNow
  // does — realtime can fire this every few seconds while the other device
  // is playing (position saves), and re-fetching every podcast's episode
  // list each time would be wasteful.
  reloadAfterRemoteChange: async ({ tables, podcastIds }) => {
    const has = (table: string): boolean => tables.includes(table)
    const episodePodcastIds = new Set(podcastIds)
    // episode_played also changes each podcast's unread count, which lives
    // on the podcast list.
    if (has('podcasts') || has('private_feeds') || has('episode_played')) {
      const before = new Set(get().podcasts.map((p) => p.id))
      await get().loadSubscriptions()
      for (const p of get().podcasts) if (!before.has(p.id)) episodePodcastIds.add(p.id)
    }
    const tasks: Promise<void>[] = []
    if (has('private_feeds')) tasks.push(get().loadPrivateFeeds())
    if (has('queue')) tasks.push(get().loadQueue())
    if (has('queue_prefs')) tasks.push(get().loadQueuePrefs())
    if (has('stations')) tasks.push(get().loadStations())
    if (has('playback_positions')) tasks.push(get().loadPositions())
    if (has('podcast_settings')) {
      for (const id of Object.keys(get().settingsByPodcast)) tasks.push(get().loadPodcastSettings(id))
    }
    for (const id of episodePodcastIds) tasks.push(get().loadEpisodes(id))
    await Promise.all(tasks)
  }
})
