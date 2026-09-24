import type { StateCreator } from 'zustand'
import type { QueueView } from '@renderer/types'
import { DEFAULT_QUEUE_PREFS, type QueueSortMode } from '@shared/queueView'
import type { AppState } from '../store'
import { getEffectiveQueue } from '@renderer/utils/queueOrder'

export interface QueueSlice {
  queue: string[] // episodeIds
  queueDragId: string | null
  queueDragOverId: string | null
  queueView: QueueView
  queueSortMode: QueueSortMode
  queueGroupByShow: boolean
  // The user's ranking of their shows (podcast ids, first = top). Drives the
  // Library's order and the 'show' queue sort. Device-local (see QueuePrefs).
  showOrder: string[]
  showOrderModalOpen: boolean
  loadQueue: () => Promise<void>
  loadQueuePrefs: () => Promise<void>
  addToQueue: (episodeId: string) => void
  setQueueDragId: (id: string | null) => void
  setQueueDragOverId: (id: string | null) => void
  reorderQueue: (fromEpisodeId: string, toEpisodeId: string) => void
  removeFromQueue: (episodeId: string) => void
  clearQueue: () => void
  setQueueDirect: (episodeIds: string[]) => void
  setQueueView: (v: QueueView) => void
  setQueueSortMode: (mode: QueueSortMode) => void
  setQueueGroupByShow: (v: boolean) => void
  setShowOrder: (podcastIds: string[]) => void
  openShowOrderModal: () => void
  closeShowOrderModal: () => void
}

function persistQueue(queue: string[]): void {
  window.api.queue.set(queue)
}

function persistPrefs(get: () => AppState): void {
  const { queueSortMode, queueGroupByShow, queueView, showOrder } = get()
  window.api.queue.setPrefs({
    sortMode: queueSortMode,
    groupByShow: queueGroupByShow,
    queueView,
    showOrder
  })
}

export const createQueueSlice: StateCreator<AppState, [], [], QueueSlice> = (set, get) => ({
  queue: [],
  queueDragId: null,
  queueDragOverId: null,
  queueView: DEFAULT_QUEUE_PREFS.queueView,
  queueSortMode: DEFAULT_QUEUE_PREFS.sortMode,
  queueGroupByShow: DEFAULT_QUEUE_PREFS.groupByShow,
  showOrder: [],
  showOrderModalOpen: false,

  loadQueue: async () => {
    const queue = await window.api.queue.get()
    set({ queue })
  },

  loadQueuePrefs: async () => {
    const prefs = await window.api.queue.getPrefs()
    if (!prefs) return
    set({
      queueSortMode: prefs.sortMode,
      queueGroupByShow: prefs.groupByShow,
      queueView: prefs.queueView,
      showOrder: prefs.showOrder ?? []
    })
  },

  addToQueue: (episodeId) => {
    if (get().queue.includes(episodeId)) return
    const queue = [...get().queue, episodeId]
    set({ queue })
    persistQueue(queue)
  },

  setQueueDragId: (id) => set({ queueDragId: id }),
  setQueueDragOverId: (id) => set({ queueDragOverId: id }),

  // Takes episode ids rather than array indices deliberately — the UI often
  // reorders against a filtered/sorted/grouped *view* of the queue, and a
  // view index doesn't line up with this array's real index whenever any
  // entry is hidden (e.g. a stale queue id that no longer resolves to a
  // loaded episode). IDs are unambiguous no matter what's filtered out.
  reorderQueue: (fromEpisodeId, toEpisodeId) => {
    if (fromEpisodeId === toEpisodeId) {
      set({ queueDragId: null, queueDragOverId: null })
      return
    }
    const current = get().queue
    const fromIdx = current.indexOf(fromEpisodeId)
    if (fromIdx === -1 || current.indexOf(toEpisodeId) === -1) {
      set({ queueDragId: null, queueDragOverId: null })
      return
    }
    const arr = [...current]
    arr.splice(fromIdx, 1)
    const insertAt = arr.indexOf(toEpisodeId)
    arr.splice(insertAt, 0, fromEpisodeId)
    set({ queue: arr, queueDragId: null, queueDragOverId: null })
    persistQueue(arr)
  },

  removeFromQueue: (episodeId) => {
    const queue = get().queue.filter((id) => id !== episodeId)
    set({ queue })
    persistQueue(queue)
  },

  clearQueue: () => {
    set({ queue: [] })
    persistQueue([])
  },

  setQueueDirect: (episodeIds) => {
    set({ queue: episodeIds })
    persistQueue(episodeIds)
  },

  setQueueView: (v) => {
    set({ queueView: v })
    persistPrefs(get)
  },

  // Switching to manual snapshots the order that was on screen (and playing)
  // as the stored queue, so nothing visibly jumps.
  setQueueSortMode: (mode) => {
    const state = get()
    if (state.queueSortMode === mode) return
    if (mode === 'manual') {
      const sorted = getEffectiveQueue(state)
      if (sorted.some((id, i) => id !== state.queue[i])) state.setQueueDirect(sorted)
    }
    set({ queueSortMode: mode })
    persistPrefs(get)
  },

  setQueueGroupByShow: (v) => {
    set({ queueGroupByShow: v })
    persistPrefs(get)
  },

  setShowOrder: (podcastIds) => {
    set({ showOrder: podcastIds })
    persistPrefs(get)
  },

  openShowOrderModal: () => set({ showOrderModalOpen: true }),
  closeShowOrderModal: () => set({ showOrderModalOpen: false })
})
