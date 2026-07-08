import PodcastArtwork from './PodcastArtwork'

interface EpisodeArtworkProps {
  artworkUrl?: string | null
  fallbackLabel: string
  size: number | 'fill'
  radius?: number
  shadow?: string
  progress?: number // 0-1; omit or out of (0.02, 0.97) range to hide the bar
}

// A thin "continue listening" bar under the artwork, shown only for episodes
// that have been started but not finished — a played episode or one that
// hasn't been opened yet renders identically to plain PodcastArtwork.
function EpisodeArtwork({ progress, ...artworkProps }: EpisodeArtworkProps): React.JSX.Element {
  const showBar = typeof progress === 'number' && progress > 0.02 && progress < 0.97

  return (
    <div
      style={{
        position: 'relative',
        flexShrink: 0,
        width: artworkProps.size === 'fill' ? '100%' : artworkProps.size
      }}
    >
      <PodcastArtwork {...artworkProps} />
      {showBar && (
        <div
          style={{
            position: 'absolute',
            left: 3,
            right: 3,
            bottom: 3,
            height: 3,
            borderRadius: 2,
            background: 'rgba(0,0,0,0.25)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              background: 'var(--color-accent)'
            }}
          />
        </div>
      )}
    </div>
  )
}

export default EpisodeArtwork
