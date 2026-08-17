import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Play, Pause } from 'lucide-react-native'
import { useStore } from '../state/store'
import { buildEpisodeIndex } from '../lib/episodeIndex'
import Artwork from './Artwork'
import { colors, radii } from '../theme'

interface Props {
  onOpen: (podcastId: string, episodeId: string) => void
}

// A persistent now-playing bar, the one piece every mainstream podcast app
// has and this one didn't: without it, the only way to see or control
// what's playing is to navigate back to the Queue and open the full Player
// screen. Rendered once at the app root, above the tab bar (or above the
// content column on tablet), and only while something's actually loaded —
// hidden entirely on the Player screen itself, which already shows this.
export default function MiniPlayer({ onOpen }: Props): React.JSX.Element | null {
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const currentTimeSec = useStore((s) => s.currentTimeSec)
  const duration = useStore((s) => s.duration)
  const togglePlay = useStore((s) => s.togglePlay)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)

  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])
  const episode = currentEpisodeId ? episodeIndex.get(currentEpisodeId) : undefined
  const podcast = episode ? podcasts.find((p) => p.id === episode.podcastId) : undefined

  if (!episode || !podcast) return null

  const progress = duration > 0 ? Math.min(1, currentTimeSec / duration) : 0

  return (
    <Pressable style={styles.container} onPress={() => onOpen(podcast.id, episode.id)}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Artwork url={episode.artworkUrl ?? podcast.artworkUrl} size={36} radius={radii.artworkSm} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {episode.title}
          </Text>
          <Text style={styles.podcastName} numberOfLines={1}>
            {podcast.name}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e.stopPropagation()
            togglePlay()
          }}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <Pause size={20} color={colors.accent} fill={colors.accent} />
          ) : (
            <Play size={20} color={colors.accent} fill={colors.accent} />
          )}
        </Pressable>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  progressTrack: { height: 2, backgroundColor: '#e0e0e6' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  title: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  podcastName: { fontSize: 11, color: colors.textMuted, marginTop: 1 }
})
