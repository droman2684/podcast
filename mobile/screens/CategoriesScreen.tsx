import { useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { Station } from '@shared/types'
import { useStore } from '../state/store'
import SwipeToDelete from '../components/SwipeToDelete'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  onBack: () => void
  onOpenCategory: (stationId: string) => void
}

// "Categories" here is the mobile name for the desktop app's Stations
// feature — same underlying data (see the store's stations comment), just
// used on mobile to group the Library instead of as an aggregate playlist.
export default function CategoriesScreen({ onBack, onOpenCategory }: Props): React.JSX.Element {
  const stations = useStore((s) => s.stations)
  const createCategory = useStore((s) => s.createCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    setError(null)
    try {
      await createCategory(trimmed)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (stationId: string): void => {
    setError(null)
    deleteCategory(stationId).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  const renderItem = ({ item }: { item: Station }): React.JSX.Element => (
    <SwipeToDelete deleteLabel="Delete" onDelete={() => handleDelete(item.id)}>
      <Pressable style={styles.row} onPress={() => onOpenCategory(item.id)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowMeta}>
            {item.podcastIds.length} show{item.podcastIds.length === 1 ? '' : 's'}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.textDisabled} />
      </Pressable>
    </SwipeToDelete>
  )

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Library'}</Text>
      </Pressable>
      <Text style={styles.title}>Categories</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="New category name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <Pressable
          style={styles.createBtn}
          onPress={() => !creating && handleCreate()}
          accessibilityLabel="Add category"
        >
          <Text style={styles.createBtnText}>{creating ? '…' : 'Add'}</Text>
        </Pressable>
      </View>

      <FlatList
        data={stations}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.empty}>No categories yet — create one above, then add shows to it.</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  back: { color: colors.accent, marginBottom: 8, fontSize: 15, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 16 },
  createRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.input,
    padding: 10,
    fontSize: 15
  },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.input,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: 20, marginBottom: 8 },
  listContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    padding: 14,
    ...cardShadow
  },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 }
})
