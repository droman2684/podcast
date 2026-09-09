import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Library, Sparkles, ListOrdered } from 'lucide-react-native'
import { colors } from '../theme'

export type Tab = 'library' | 'discover' | 'queue'

const TABS: { key: Tab; label: string; Icon: typeof Library }[] = [
  { key: 'queue', label: 'Queue', Icon: ListOrdered },
  { key: 'library', label: 'Library', Icon: Library },
  { key: 'discover', label: 'Discover', Icon: Sparkles }
]

interface Props {
  active: Tab
  onSelect: (tab: Tab) => void
}

export default function TabBar({ active, onSelect }: Props): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {TABS.map(({ key, label, Icon }) => {
        const isActive = active === key
        return (
          <Pressable key={key} style={styles.item} onPress={() => onSelect(key)}>
            <Icon size={20} color={isActive ? colors.accent : colors.navInactive} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingBottom: 24,
    paddingTop: 10,
    backgroundColor: colors.surface
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 11, color: colors.navInactive, fontWeight: '600' },
  labelActive: { color: colors.accent }
})
