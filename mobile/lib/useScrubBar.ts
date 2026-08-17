import { useRef, useState } from 'react'
import { PanResponder, type GestureResponderHandlers, type LayoutChangeEvent } from 'react-native'

// Drag-to-seek logic shared by PlayerScreen (vertical phone/Now Playing
// layout) and PlayerBar (horizontal iPad player bar) — same PanResponder
// pattern either way, just at different widths. Pulled out once both needed
// it rather than duplicating the gesture handler a second time.
//
// PanResponder is created once via useRef — its callbacks close over
// whatever barWidth/duration were at creation time, so live values are read
// through refs instead (same pattern as DraggableList.tsx's latestRef).
interface Options {
  duration: number
  currentTimeSec: number
  onSeek: (sec: number) => void
}

interface ScrubBar {
  onBarLayout: (e: LayoutChangeEvent) => void
  panHandlers: GestureResponderHandlers
  /** 0-1. Tracks the drag while scrubbing; falls back to actual playback progress otherwise. */
  progress: number
  displayedTimeSec: number
  /** True while the user is actively dragging the thumb. */
  scrubbing: boolean
}

export function useScrubBar({ duration, currentTimeSec, onSeek }: Options): ScrubBar {
  const [barWidth, setBarWidth] = useState(0)
  // null when not actively dragging the seek thumb; a 0-1 ratio while
  // dragging, so the bar tracks the finger instead of the (stale, until
  // seek completes) playback position.
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)

  const barWidthRef = useRef(barWidth)
  barWidthRef.current = barWidth
  const durationRef = useRef(duration)
  durationRef.current = duration
  const dragStartXRef = useRef(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        dragStartXRef.current = evt.nativeEvent.locationX
        const width = barWidthRef.current
        const ratio = width > 0 ? Math.min(1, Math.max(0, evt.nativeEvent.locationX / width)) : 0
        setScrubRatio(ratio)
      },
      onPanResponderMove: (_evt, gesture) => {
        const width = barWidthRef.current
        if (width <= 0) return
        const x = dragStartXRef.current + gesture.dx
        setScrubRatio(Math.min(1, Math.max(0, x / width)))
      },
      onPanResponderRelease: () => {
        setScrubRatio((ratio) => {
          if (ratio !== null && durationRef.current > 0) onSeek(ratio * durationRef.current)
          return null
        })
      },
      onPanResponderTerminate: () => setScrubRatio(null)
    })
  ).current

  const progress = scrubRatio !== null ? scrubRatio : duration > 0 ? currentTimeSec / duration : 0
  const displayedTimeSec = scrubRatio !== null ? scrubRatio * duration : currentTimeSec

  return {
    onBarLayout: (e) => setBarWidth(e.nativeEvent.layout.width),
    panHandlers: panResponder.panHandlers,
    progress,
    displayedTimeSec,
    scrubbing: scrubRatio !== null
  }
}
