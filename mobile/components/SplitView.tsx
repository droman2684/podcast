import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { colors } from '../theme'
import type { LayoutMode } from '../lib/useLayout'

// See design_ipad/Empire-Pod-iPad-Design-Spec.md §3/§6. A generic list/detail
// wrapper used by Library and Queue at tablet widths:
//  - `regular` (full sidebar, landscape): list and detail render side by side.
//  - `rail` (icon rail, portrait): collapses to push navigation, matching the
//    phone app — list pane fills the width until something's selected, then
//    the detail pane takes over with a back bar. No new interaction to learn
//    when the user rotates.
// Never rendered at `compact` — phone screens keep their existing full-bleed
// layouts untouched.
export const LIST_PANE_WIDTH = 356

interface Props {
  mode: LayoutMode
  list: React.ReactNode
  detail: React.ReactNode | null
  hasSelection: boolean
  onBack: () => void
  backLabel: string
  /** Shown in the detail pane at `regular` width when nothing is selected yet. */
  emptyDetailLabel?: string
}

export default function SplitView({
  mode,
  list,
  detail,
  hasSelection,
  onBack,
  backLabel,
  emptyDetailLabel = 'Select an item to see details.'
}: Props): React.JSX.Element {
  if (mode === 'rail') {
    if (hasSelection) {
      return (
        <View style={styles.railDetail}>
          <Pressable style={styles.backBar} onPress={onBack} hitSlop={8}>
            <ChevronLeft size={18} color={colors.accent} />
            <Text style={styles.backText}>{backLabel}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>{detail}</View>
        </View>
      )
    }
    return <View style={{ flex: 1 }}>{list}</View>
  }

  return (
    <View style={styles.regular}>
      <View style={styles.listPane}>{list}</View>
      <View style={styles.detailPane}>
        {detail ?? (
          <View style={styles.emptyDetail}>
            <Text style={styles.emptyDetailText}>{emptyDetailLabel}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  regular: { flex: 1, flexDirection: 'row' },
  listPane: {
    width: LIST_PANE_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    backgroundColor: colors.bg
  },
  detailPane: { flex: 1, backgroundColor: colors.surface },
  emptyDetail: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyDetailText: { color: colors.textMuted, fontSize: 13.5, textAlign: 'center' },

  railDetail: { flex: 1 },
  backBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10
  },
  backText: { color: colors.accent, fontSize: 15, fontWeight: '600' }
})
