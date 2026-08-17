import { View, Text, StyleSheet } from 'react-native'
import { useStore } from '../state/store'
import { colors } from '../theme'

// Every write in state/store.ts (setPlayed, queue mutations, downloads,
// subscribe, ...) already fails past just a console.error when there's no
// network — the optimistic UI update still looks like it worked, with
// nothing telling the user why it didn't actually save. This doesn't fix
// that per-action silence, but it at least explains the "why" up front so a
// failed action reads as expected rather than as a mystery bug.
export default function OfflineBanner(): React.JSX.Element | null {
  const isOffline = useStore((s) => s.isOffline)
  if (!isOffline) return null

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>You&apos;re offline — changes will sync once you&apos;re back online.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // This app has no SafeAreaView anywhere (every screen hardcodes its own
  // paddingTop instead) — since the banner becomes the new topmost element
  // when shown, it needs its own status-bar clearance rather than relying
  // on a screen's existing paddingTop, at the cost of a slightly larger
  // gap above that screen's own content while offline.
  banner: {
    backgroundColor: colors.warning,
    paddingTop: 50,
    paddingBottom: 8,
    paddingHorizontal: 16
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center'
  }
})
