import type { StateCreator } from 'zustand'
import type { SyncPhase } from '@shared/ipcChannels'
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
  }
})
