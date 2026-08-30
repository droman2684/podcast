import { useState } from 'react'
import { View, Text, Pressable, Switch, Alert, StyleSheet, ActivityIndicator } from 'react-native'
import { Camera } from 'lucide-react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { pickPodcastArtwork } from '../lib/podcastArtwork'
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
  const setPodcastArtwork = useStore((s) => s.setPodcastArtwork)
  const [unsubscribing, setUnsubscribing] = useState(false)
  const [markingPlayed, setMarkingPlayed] = useState(false)
  const [uploadingArt, setUploadingArt] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnsubscribe = async (): Promise<void> => {
    setUnsubscribing(true)
    setError(null)
    try {
      await unsubscribe(podcast.id)
      onUnsubscribed()
    } catch (err) {
      // A finally block resets the button either way, but the explicit
      // catch keeps the failure visible instead of just quietly retrying
      // to look "normal" — markingPlayed had the same gap before this.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUnsubscribing(false)
    }
  }

  const confirmUnsubscribe = (): void => {
    Alert.alert('Unsubscribe', `Unsubscribe from ${podcast.name}? This removes it and its episodes from your library.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unsubscribe', style: 'destructive', onPress: handleUnsubscribe }
    ])
  }

  const handleMarkAllPlayed = async (): Promise<void> => {
    setMarkingPlayed(true)
    setError(null)
    try {
      await markAllPlayed(podcast.id)
    } catch (err) {
      // Previously had no catch/finally at all — a failed write here left
      // the button stuck on "Marking…" forever with no way out.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMarkingPlayed(false)
    }
  }

  const handleNotifyToggle = async (value: boolean): Promise<void> => {
    setError(null)
    try {
      await setNotify(podcast.id, value)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleChangeArtwork = async (): Promise<void> => {
    if (uploadingArt) return
    setUploadingArt(true)
    setError(null)
    try {
      const dataUrl = await pickPodcastArtwork()
      if (dataUrl) await setPodcastArtwork(podcast.id, dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingArt(false)
    }
  }

  const handleRemoveArtwork = async (): Promise<void> => {
    setError(null)
    try {
      await setPodcastArtwork(podcast.id, null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Back'}</Text>
      </Pressable>
      <View style={styles.header}>
        <Pressable
          onPress={handleChangeArtwork}
          disabled={uploadingArt}
          accessibilityLabel="Change show artwork"
          style={{ position: 'relative' }}
        >
          <Artwork url={podcast.customArtworkUrl ?? podcast.artworkUrl} size={56} radius={10} />
          {uploadingArt ? (
            <View style={[styles.artworkOverlay, { borderRadius: 10 }]}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          ) : (
            <View style={styles.artworkBadge}>
              <Camera size={12} color="#fff" />
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{podcast.name}</Text>
          <Text style={styles.author}>{podcast.author}</Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Notify on new episodes</Text>
          <Switch
            value={notify}
            onValueChange={handleNotifyToggle}
            accessibilityLabel="Notify on new episodes"
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Management</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.actionRow}
          onPress={() => !markingPlayed && handleMarkAllPlayed()}
          accessibilityLabel="Mark all episodes as played"
        >
          <Text style={styles.actionText}>
            {markingPlayed ? 'Marking…' : 'Mark all episodes as played'}
          </Text>
        </Pressable>
        {podcast.customArtworkUrl && (
          <Pressable
            style={styles.actionRow}
            onPress={handleRemoveArtwork}
            accessibilityLabel="Remove custom artwork"
          >
            <Text style={styles.actionText}>Remove custom artwork</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={styles.dangerRow}
        onPress={() => !unsubscribing && confirmUnsubscribe()}
        accessibilityLabel={`Unsubscribe from ${podcast.name}`}
      >
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
  artworkBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.textSecondary,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  artworkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  author: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  error: { color: colors.danger, fontSize: 12, marginBottom: 16 },
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
