import { useState } from 'react'

interface ScrubHover {
  hoverFraction: number | null
  hoverTimeSec: number | null
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave: () => void
}

export function useScrubHover(durationSec: number): ScrubHover {
  const [hoverFraction, setHoverFraction] = useState<number | null>(null)

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setHoverFraction(fraction)
  }

  const onMouseLeave = (): void => setHoverFraction(null)

  return {
    hoverFraction,
    hoverTimeSec: hoverFraction !== null ? hoverFraction * durationSec : null,
    onMouseMove,
    onMouseLeave
  }
}
