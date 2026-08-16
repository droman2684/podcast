import { View, Text, Pressable, StyleSheet } from 'react-native'
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
          {(['grid', 'list'] as LibraryView[]).map((view) => (
            <Pressable
              key={view}
              style={[styles.option, { flex: 1 }, defaultLibraryView === view && styles.optionActive]}
              onPress={() => setDefaultLibraryView(view)}
            >
              <Text style={[styles.optionText, defaultLibraryView === view && styles.optionTextActive]}>
                {view === 'grid' ? 'Card' : 'List'}
              </Text>
            </Pressable>
          ))}
        </View>
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
