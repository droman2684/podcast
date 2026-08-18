import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useStore, type LibraryView } from '../state/store'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  onBack: () => void
}

const SKIP_OPTIONS = [10, 15, 30, 45, 60]

export default function SettingsScreen({ onBack }: Props): React.JSX.Element {
  const skipBackSec = useStore((s) => s.skipBackSec)
  const skipForwardSec = useStore((s) => s.skipForwardSec)
  const defaultLibraryView = useStore((s) => s.defaultLibraryView)
  const setSkipBackSec = useStore((s) => s.setSkipBackSec)
  const setSkipForwardSec = useStore((s) => s.setSkipForwardSec)
  const setDefaultLibraryView = useStore((s) => s.setDefaultLibraryView)
  const userEmail = useStore((s) => s.userEmail)
  const signOut = useStore((s) => s.signOut)
  const libraryLoading = useStore((s) => s.libraryLoading)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const refreshPositions = useStore((s) => s.refreshPositions)
  const loadStations = useStore((s) => s.loadStations)

  // A manual escape hatch for "I don't trust what I'm seeing right now" —
  // rather than waiting on the next foreground/realtime event. Re-runs the
  // same full pull loadLibrary already does on sign-in (podcasts, episodes,
  // positions, queue, played state, settings), plus refreshPositions (cheap,
  // catches anything loadLibrary's own gate just rejected) and stations.
  const [justSynced, setJustSynced] = useState(false)
  const handleSyncNow = async (): Promise<void> => {
    await Promise.all([loadLibrary(), refreshPositions(), loadStations()])
    setJustSynced(true)
    setTimeout(() => setJustSynced(false), 2000)
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Back'}</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.sectionTitle}>Skip back</Text>
      <View style={styles.card}>
        <View style={styles.optionRow}>
          {SKIP_OPTIONS.map((sec) => (
            <Pressable
              key={sec}
              style={[styles.option, skipBackSec === sec && styles.optionActive]}
              onPress={() => setSkipBackSec(sec)}
            >
              <Text style={[styles.optionText, skipBackSec === sec && styles.optionTextActive]}>{sec}s</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Skip forward</Text>
      <View style={styles.card}>
        <View style={styles.optionRow}>
          {SKIP_OPTIONS.map((sec) => (
            <Pressable
              key={sec}
              style={[styles.option, skipForwardSec === sec && styles.optionActive]}
              onPress={() => setSkipForwardSec(sec)}
            >
              <Text style={[styles.optionText, skipForwardSec === sec && styles.optionTextActive]}>{sec}s</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Default library view</Text>
      <View style={styles.card}>
        <View style={styles.optionRow}>
          {(['grid', 'list', 'category'] as LibraryView[]).map((view) => (
            <Pressable
              key={view}
              style={[styles.option, { flex: 1 }, defaultLibraryView === view && styles.optionActive]}
              onPress={() => setDefaultLibraryView(view)}
            >
              <Text style={[styles.optionText, defaultLibraryView === view && styles.optionTextActive]}>
                {view === 'grid' ? 'Card' : view === 'list' ? 'List' : 'Category'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Sync</Text>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={handleSyncNow} disabled={libraryLoading}>
          <Text style={styles.rowLabel}>
            {libraryLoading ? 'Syncing…' : justSynced ? 'Synced' : 'Sync Now'}
          </Text>
          {libraryLoading && <ActivityIndicator size="small" color={colors.accent} />}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{userEmail ?? 'Signed in'}</Text>
        </View>
      </View>

      <Pressable style={styles.dangerRow} onPress={() => signOut()}>
        <Text style={styles.dangerText}>Sign Out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 20 },
  back: { color: colors.accent, marginBottom: 20, fontSize: 15 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 24 },
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
    padding: 10,
    ...cardShadow
  },
  optionRow: { flexDirection: 'row', gap: 8 },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.item,
    backgroundColor: colors.bg,
    alignItems: 'center'
  },
  optionActive: { backgroundColor: colors.accent },
  optionText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  optionTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
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
