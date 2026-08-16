import { View, Text, Pressable, StyleSheet } from 'react-native'

export type Tab = 'library' | 'search' | 'discover' | 'queue'

const TABS: { key: Tab; label: string }[] = [
  { key: 'library', label: 'Library' },
  { key: 'search', label: 'Search' },
  { key: 'discover', label: 'Discover' },
  { key: 'queue', label: 'Queue' }
]

interface Props {
  active: Tab
  onSelect: (tab: Tab) => void
}

export default function TabBar({ active, onSelect }: Props): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => (
        <Pressable key={tab.key} style={styles.item} onPress={() => onSelect(tab.key)}>
          <Text style={[styles.label, active === tab.key && styles.labelActive]}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    paddingBottom: 24,
    paddingTop: 10,
    backgroundColor: '#fff'
  },
  item: { flex: 1, alignItems: 'center' },
  label: { fontSize: 12, color: '#888', fontWeight: '600' },
  labelActive: { color: '#FF5910' }
})
