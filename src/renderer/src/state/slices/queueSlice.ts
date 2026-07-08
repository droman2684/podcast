import type { StateCreator } from 'zustand'
import type { AppState } from '../store'

export interface QueueSlice {
  queue: string[] // episodeIds
  queueDragId: string | null
  queueDragOverId: string | null
  loadQueue: () => Promise<void>
  addToQueue: (episodeId: string) => void
  setQueueDragId: (id: string | null) => void
  setQueueDragOverId: (id: string | null) => void
  reorderQueue: (fromEpisodeId: string, toEpisodeId: string) => void
  removeFromQueue: (episodeId: string) => void
  clearQueue: () => void
  setQueueDirect: (episodeIds: string[]) => void
}

function persistQueue(queue: string[]): void {
  window.api.queue.set(queue)
}

export const createQueueSlice: StateCreator<AppState, [], [], QueueSlice> = (set, get) => ({
  queue: [],
  queueDragId: null,
  queueDragOverId: null,

  loadQueue: async () => {
    const queue = await window.api.queue.get()
    set({ queue })
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
  }
})
