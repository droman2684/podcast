import { useWindowDimensions } from 'react-native'

// Layout modes, keyed off *window* width rather than screen width so that
// iPad Split View and Stage Manager fall out for free — an Empire Pod window
// narrowed to 640pt gets the phone layout it already has, without any
// device-type checks.
//
//   compact  <700   phone, and narrow iPad windows        → bottom TabBar
//   rail     700+   iPad portrait, half-screen Split View → icon-only sidebar
//   regular  900+   iPad landscape, full-screen           → full sidebar
//
// The height floor is not decoration: a Pro Max in landscape is 932x430, which
// clears the 900pt width bar and would otherwise hand a phone the full 260pt
// iPad sidebar. Requiring 600pt of height keeps every phone orientation
// compact while every real iPad window stays above it.
//
// See design_ipad/Empire-Pod-iPad-Design-Spec.md §2.
export type LayoutMode = 'compact' | 'rail' | 'regular'

export const RAIL_MIN_WIDTH = 700
export const REGULAR_MIN_WIDTH = 900
export const TABLET_MIN_HEIGHT = 600

interface Layout {
  mode: LayoutMode
  /** True for both `rail` and `regular` — i.e. "show a sidebar, not a tab bar". */
  isTablet: boolean
  width: number
  height: number
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions()

  const tall = height >= TABLET_MIN_HEIGHT

  const mode: LayoutMode =
    tall && width >= REGULAR_MIN_WIDTH
      ? 'regular'
      : tall && width >= RAIL_MIN_WIDTH
        ? 'rail'
        : 'compact'

  return { mode, isTablet: mode !== 'compact', width, height }
}
