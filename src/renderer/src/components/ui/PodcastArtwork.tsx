import { useState } from 'react'
import { deriveFallback } from '@renderer/utils/artworkFallback'

interface PodcastArtworkProps {
  artworkUrl?: string | null
  fallbackLabel: string
  size: number | 'fill'
  radius?: number
  shadow?: string
}

function PodcastArtwork({
  artworkUrl,
  fallbackLabel,
  size,
  radius,
  shadow
}: PodcastArtworkProps): React.JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  const isFill = size === 'fill'
  const resolvedRadius = radius ?? (isFill ? 12 : Math.max(6, Math.round(size * 0.18)))
  const dimensionStyle = isFill
    ? { width: '100%', aspectRatio: '1' }
    : { width: size, height: size }
  const fontSize = isFill ? 22 : Math.max(9, Math.round(size * 0.28))

  if (artworkUrl && !imgFailed) {
    return (
      <img
        src={artworkUrl}
        alt=""
        onError={() => setImgFailed(true)}
        style={{
          ...dimensionStyle,
          borderRadius: resolvedRadius,
          objectFit: 'cover',
          flexShrink: 0,
          boxShadow: shadow
        }}
      />
    )
  }

  const { bg, init } = deriveFallback(fallbackLabel)

  return (
    <div
      style={{
        ...dimensionStyle,
        borderRadius: resolvedRadius,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: shadow,
        color: 'rgba(255,255,255,.85)',
        fontWeight: 700,
        fontSize,
        letterSpacing: '0.3px'
      }}
    >
      {init}
    </div>
  )
}

export default PodcastArtwork
