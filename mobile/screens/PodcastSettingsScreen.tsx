import { useState } from 'react'
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'

interface Props {
  podcast: Podcast
  onBack: () => void
  onUnsubscribed: () => void
}

export default function PodcastSettingsScreen({ podcast, onBack, onUnsubscribed }: Props): React.JSX.Element {
  const notify = useStore((s) => s.podcastSettings[podcast.id]?.notify ?? false)
  const setNotify = useStore((s) => s.setNotify)
  const unsubscribe = useStore((s) => s.unsubscribe)
  const [unsubscribing, setUnsubscribing] = useState(false)

  const handleUnsubscribe = async (): Promise<void> => {
    setUnsubscribing(true)
    await unsubscribe(podcast.id)
    onUnsubscribed()
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

      <View style={styles.row}>
        <Text style={styles.rowLabel}>Notify on new episodes</Text>
        <Switch value={notify} onValueChange={(v) => setNotify(podcast.id, v)} />
      </View>

      <Pressable
        style={styles.dangerRow}
        onPress={() => !unsubscribing && handleUnsubscribe()}
      >
        <Text style={styles.dangerText}>
          {unsubscribing ? 'Unsubscribing…' : `Unsubscribe from ${podcast.name}`}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 20 },
  back: { color: '#FF5910', marginBottom: 20, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 28 },
  name: { fontSize: 17, fontWeight: '700' },
  author: { fontSize: 13, color: '#888', marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#eee'
  },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  dangerRow: {
    marginTop: 24,
    backgroundColor: '#fff5f5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.15)',
    paddingVertical: 14,
    alignItems: 'center'
  },
  dangerText: { color: '#d33', fontWeight: '600', fontSize: 14 }
})
