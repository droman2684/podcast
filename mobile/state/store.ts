import { create } from 'zustand'
import type { Podcast, Episode, PodcastSettings } from '@shared/types'
import type { DiscoverPodcast } from '@shared/types'
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
  podcastSettings: Record<string, PodcastSettings>
  queue: string[]
  libraryLoading: boolean
  libraryError: string | null

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

  addToQueue: (episodeId: string) => Promise<void>
  removeFromQueue: (episodeId: string) => Promise<void>
}

async function saveQueue(episodeIds: string[]): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return
  await supabase.from('queue').upsert({
    user_id: userId,
    episode_ids: episodeIds,
    updated_at: new Date().toISOString()
  })
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
    set({ podcasts: [], episodesByPodcast: {}, positions: {}, podcastSettings: {}, queue: [] })
  },

  // Pulls the subscription list synced from desktop (or a previous mobile
  // session), then fetches each feed's RSS directly (there's no
  // main-process cache to lean on here) to get episode lists and
  // artwork/name — the same split the desktop app itself uses: `podcasts`
  // rows are identity/settings only, never the RSS-derived fields.
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

      const { data: settingsRows, error: settingsErr } = await supabase
        .from('podcast_settings')
        .select('*')
        .eq('user_id', userId)
      if (settingsErr) throw new Error(settingsErr.message)
      const podcastSettings: Record<string, PodcastSettings> = {}
      for (const row of settingsRows ?? []) podcastSettings[row.podcast_id] = { notify: row.notify }

      const { data: queueRow, error: queueErr } = await supabase
        .from('queue')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (queueErr) throw new Error(queueErr.message)
      const queue: string[] = Array.isArray(queueRow?.episode_ids) ? queueRow.episode_ids : []

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

      set({ podcasts, episodesByPodcast, positions, podcastSettings, queue, libraryLoading: false })
    } catch (err) {
      set({ libraryLoading: false, libraryError: err instanceof Error ? err.message : String(err) })
    }
  },

  subscribe: async (podcast) => {
    const userId = await currentUserId()
    if (!userId) throw new Error('Not signed in')
    const { error } = await supabase.from('podcasts').upsert({
      user_id: userId,
      id: podcast.id,
      feed_url: podcast.feedUrl,
      is_private: false,
      custom_artwork_url: null,
      updated_at: new Date().toISOString(),
      deleted_at: null
    })
    if (error) throw new Error(error.message)
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
    await supabase
      .from('podcasts')
      .upsert({ user_id: userId, id: podcastId, deleted_at: new Date().toISOString() })
    if (queueChanged) await saveQueue(nextQueue)
  },

  setNotify: async (podcastId, notify) => {
    set((state) => ({
      podcastSettings: { ...state.podcastSettings, [podcastId]: { notify } }
    }))
    const userId = await currentUserId()
    if (!userId) return
    await supabase.from('podcast_settings').upsert({
      user_id: userId,
      podcast_id: podcastId,
      notify,
      updated_at: new Date().toISOString()
    })
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
    await supabase.from('episode_played').upsert({
      user_id: userId,
      episode_id: episodeId,
      podcast_id: podcastId,
      played,
      updated_at: new Date().toISOString()
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
  }
}))
