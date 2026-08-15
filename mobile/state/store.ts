import { create } from 'zustand'
import type { Podcast, Episode } from '@shared/types'
import { supabase } from '../lib/supabase'
import { parseFeed } from '../lib/rss'

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

interface AppState {
  authLoading: boolean
  signedIn: boolean
  userEmail: string | null

  podcasts: Podcast[]
  episodesByPodcast: Record<string, Episode[]>
  positions: Record<string, number>
  libraryLoading: boolean
  libraryError: string | null

  initAuth: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>

  loadLibrary: () => Promise<void>
  savePosition: (episodeId: string, positionSec: number) => Promise<void>
  markPlayed: (episodeId: string, podcastId: string) => Promise<void>
}

export const useStore = create<AppState>((set) => ({
  authLoading: true,
  signedIn: false,
  userEmail: null,

  podcasts: [],
  episodesByPodcast: {},
  positions: {},
  libraryLoading: false,
  libraryError: null,

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
    set({ podcasts: [], episodesByPodcast: {}, positions: {} })
  },

  // Pulls the subscription list synced from desktop, then fetches each
  // feed's RSS directly (there's no main-process cache to lean on here) to
  // get episode lists and artwork/name — the same split the desktop app
  // itself uses: `podcasts` rows are identity/settings only, never the
  // RSS-derived fields.
  loadLibrary: async () => {
    set({ libraryLoading: true, libraryError: null })
    try {
      const userId = await currentUserId()
      if (!userId) throw new Error('Not signed in')

      const { data: podcastRows, error: podcastsErr } = await supabase
        .from('podcasts')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
      if (podcastsErr) throw new Error(podcastsErr.message)

      const { data: positionRows, error: posErr } = await supabase
        .from('playback_positions')
        .select('*')
        .eq('user_id', userId)
      if (posErr) throw new Error(posErr.message)
      const positions: Record<string, number> = {}
      for (const row of positionRows ?? []) positions[row.episode_id] = row.position_sec

      const { data: playedRows, error: playedErr } = await supabase
        .from('episode_played')
        .select('*')
        .eq('user_id', userId)
      if (playedErr) throw new Error(playedErr.message)
      const playedByEpisode = new Map<string, boolean>(
        (playedRows ?? []).map((r) => [r.episode_id as string, r.played as boolean])
      )

      const podcasts: Podcast[] = []
      const episodesByPodcast: Record<string, Episode[]> = {}

      for (const row of (podcastRows ?? []) as PodcastRow[]) {
        // Private feeds need a password that, by design, never leaves the
        // device that created them (see the desktop app's privateFeeds.ts)
        // — not supported on mobile yet, so skip rather than show a feed
        // that can never actually load here.
        if (row.is_private) continue
        try {
          const parsed = await parseFeed(row.feed_url, row.id)
          const episodes = parsed.episodes.map((e) => ({
            ...e,
            played: playedByEpisode.get(e.id) ?? false
          }))
          podcasts.push({
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
          })
          episodesByPodcast[row.id] = episodes
        } catch (err) {
          console.error(`Failed to load feed ${row.feed_url}:`, err)
        }
      }

      set({ podcasts, episodesByPodcast, positions, libraryLoading: false })
    } catch (err) {
      set({ libraryLoading: false, libraryError: err instanceof Error ? err.message : String(err) })
    }
  },

  savePosition: async (episodeId, positionSec) => {
    set((state) => ({ positions: { ...state.positions, [episodeId]: positionSec } }))
    const userId = await currentUserId()
    if (!userId) return
    await supabase.from('playback_positions').upsert({
      user_id: userId,
      episode_id: episodeId,
      position_sec: positionSec,
      updated_at: new Date().toISOString()
    })
  },

  markPlayed: async (episodeId, podcastId) => {
    set((state) => ({
      episodesByPodcast: {
        ...state.episodesByPodcast,
        [podcastId]: (state.episodesByPodcast[podcastId] ?? []).map((e) =>
          e.id === episodeId ? { ...e, played: true } : e
        )
      }
    }))
    const userId = await currentUserId()
    if (!userId) return
    await supabase.from('episode_played').upsert({
      user_id: userId,
      episode_id: episodeId,
      podcast_id: podcastId,
      played: true,
      updated_at: new Date().toISOString()
    })
  }
}))
