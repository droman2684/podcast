import type { StateCreator } from 'zustand'
import type { LibraryView } from '@renderer/types'
import type { AppState } from '../store'

export interface LibrarySlice {
  libraryView: LibraryView
  setLibraryView: (v: LibraryView) => void
}

export const createLibrarySlice: StateCreator<AppState, [], [], LibrarySlice> = (set) => ({
  libraryView: 'grid',
  setLibraryView: (v) => set({ libraryView: v })
})
