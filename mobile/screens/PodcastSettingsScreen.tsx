import { useState } from 'react'
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  podcast: Podcast
  onBack: () => void
  onUnsubscribed: () => void
}

export default function PodcastSettingsScreen({ podcast, onBack, onUnsubscribed }: Props): React.JSX.Element {
  const notify = useStore((s) => s.podcastSettings[podcast.id]?.notify ?? false)
  const setNotify = useStore((s) => s.setNotify)
  const unsubscribe = useStore((s) => s.unsubscribe)
  const markAllPlayed = useStore((s) => s.markAllPlayed)
  const [unsubscribing, setUnsubscribing] = useState(false)
  const [markingPlayed, setMarkingPlayed] = useState(false)

  const handleUnsubscribe = async (): Promise<void> => {
    setUnsubscribing(true)
    await unsubscribe(podcast.id)
    onUnsubscribed()
  }

  const handleMarkAllPlayed = async (): Promise<void> => {
    setMarkingPlayed(true)
    await markAllPlayed(podcast.id)
    setMarkingPlayed(false)
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Back'}</Text>
      </Pressable>
      <View style={styles.header}>
        <Artwork url={podcast.customArtworkUrl ?? podcast.artworkUrl} size={56} radius={10} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{podcast.name}</Text>
          <Text style={styles.author}>{podcast.author}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Notify on new episodes</Text>
          <Switch value={notify} onValueChange={(v) => setNotify(podcast.id, v)} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Management</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.actionRow}
          onPress={() => !markingPlayed && handleMarkAllPlayed()}
        >
          <Text style={styles.actionText}>
            {markingPlayed ? 'Marking…' : 'Mark all episodes as played'}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.dangerRow} onPress={() => !unsubscribing && handleUnsubscribe()}>
        <Text style={styles.dangerText}>
          {unsubscribing ? 'Unsubscribing…' : `Unsubscribe from ${podcast.name}`}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 20 },
  back: { color: colors.accent, marginBottom: 20, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  author: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPlaceholder,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    marginBottom: 20,
    ...cardShadow
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  actionRow: { paddingVertical: 14, paddingHorizontal: 14 },
  actionText: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  dangerRow: {
    marginTop: 4,
    backgroundColor: colors.dangerBg,
    borderRadius: radii.item,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.15)',
    paddingVertical: 14,
    alignItems: 'center'
  },
  dangerText: { color: colors.danger, fontWeight: '600', fontSize: 14 }
})
