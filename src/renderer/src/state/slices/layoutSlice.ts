import type { StateCreator } from 'zustand'
import type { ResizeTarget } from '@renderer/types'
import type { AppState } from '../store'

const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 380
const SIDEBAR_DEFAULT = 244

// Bounds for MainContent's fixed width — the Now Playing panel is the
// flex-grow (dominant) column, so MainContent is deliberately the smaller,
// secondary one here.
const MAIN_CONTENT_MIN = 280
const MAIN_CONTENT_MAX = 480
const MAIN_CONTENT_DEFAULT = 340

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export interface LayoutSlice {
  sidebarW: number
  mainContentW: number
  dragging: ResizeTarget | null
  dragStartX: number
  dragStartW: number
  beginResize: (target: ResizeTarget, clientX: number) => void
  updateResize: (clientX: number) => void
  endResize: () => void
  loadLayout: () => Promise<void>
}

export const createLayoutSlice: StateCreator<AppState, [], [], LayoutSlice> = (set, get) => ({
  sidebarW: SIDEBAR_DEFAULT,
  mainContentW: MAIN_CONTENT_DEFAULT,
  dragging: null,
  dragStartX: 0,
  dragStartW: 0,
  beginResize: (target, clientX) =>
    set({
      dragging: target,
      dragStartX: clientX,
      dragStartW: target === 'sidebar' ? get().sidebarW : get().mainContentW
    }),
  updateResize: (clientX) => {
    const { dragging, dragStartX, dragStartW } = get()
    if (!dragging) return
    const dx = clientX - dragStartX
    if (dragging === 'sidebar') {
      set({ sidebarW: clamp(dragStartW + dx, SIDEBAR_MIN, SIDEBAR_MAX) })
    } else {
      // MainContent now sits to the left of this handle (the flex-grow
      // player panel is on the right) — dragging right grows it.
      set({ mainContentW: clamp(dragStartW + dx, MAIN_CONTENT_MIN, MAIN_CONTENT_MAX) })
    }
  },
  endResize: () => {
    const wasDragging = get().dragging !== null
    set({ dragging: null })
    // Persist once the drag gesture finishes rather than on every mousemove
    // tick — resizing fires far too often to IPC-round-trip each step.
    if (wasDragging) {
      const { sidebarW, mainContentW } = get()
      window.api.layout.set({ sidebarW, mainContentW })
    }
  },
  loadLayout: async () => {
    const saved = await window.api.layout.get()
    if (!saved) return
    set({
      sidebarW: clamp(saved.sidebarW, SIDEBAR_MIN, SIDEBAR_MAX),
      mainContentW: clamp(saved.mainContentW, MAIN_CONTENT_MIN, MAIN_CONTENT_MAX)
    })
  }
})
