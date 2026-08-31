import Svg, { Circle } from 'react-native-svg'
import { colors } from '../theme'

interface Props {
  /** 0-1. Values outside that range are clamped rather than trusted, since
   * this mostly renders whatever the network last reported. */
  progress: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
}

// A small ring rather than a numeric percentage — this replaces the
// ActivityIndicator spinner shown while an episode downloads (Episode list,
// Queue, Downloads rows), so it needs to fit the same ~17-18px icon slot.
export default function DownloadProgressRing({
  progress,
  size = 18,
  strokeWidth = 2.5,
  color = colors.accent,
  trackColor = '#e0e0e6'
}: Props): React.JSX.Element {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, progress))
  const center = size / 2

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        // SVG circles start drawing at 3 o'clock — rotated to start at 12
        // instead, around the ring's own center, so it reads as a clock/pie
        // filling up rather than starting sideways.
        rotation={-90}
        origin={`${center}, ${center}`}
      />
    </Svg>
  )
}
