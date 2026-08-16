import { useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'
import type { Podcast, Station } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  station: Station
  onBack: () => void
  onDeleted: () => void
}

export default function CategoryDetailScreen({ station, onBack, onDeleted }: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const renameCategory = useStore((s) => s.renameCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const addPodcastToCategory = useStore((s) => s.addPodcastToCategory)
  const removePodcastFromCategory = useStore((s) => s.removePodcastFromCategory)
  const [name, setName] = useState(station.name)

  const memberIds = new Set(station.podcastIds)

  const handleRenameBlur = (): void => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== station.name) renameCategory(station.id, trimmed)
    else setName(station.name)
  }

  const handleDelete = async (): Promise<void> => {
    await deleteCategory(station.id)
    onDeleted()
  }

  const renderItem = ({ item }: { item: Podcast }): React.JSX.Element => {
    const included = memberIds.has(item.id)
    return (
      <Pressable
        style={styles.row}
        onPress={() =>
          included ? removePodcastFromCategory(station.id, item.id) : addPodcastToCategory(station.id, item.id)
        }
      >
        <Artwork url={item.customArtworkUrl ?? item.artworkUrl} size={40} radius={radii.artworkSm} />
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.checkbox, included && styles.checkboxOn]}>
          {included && <Check size={13} color="#fff" strokeWidth={3} />}
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Categories'}</Text>
      </Pressable>

      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        onBlur={handleRenameBlur}
        onSubmitEditing={handleRenameBlur}
        returnKeyType="done"
      />

      <Text style={styles.sectionTitle}>Shows in this category</Text>
      <FlatList
        data={podcasts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Subscribe to shows from Search to add them here.</Text>}
      />

      <Pressable style={styles.dangerRow} onPress={handleDelete}>
        <Text style={styles.dangerText}>Delete Category</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  back: { color: colors.accent, marginBottom: 12, fontSize: 15, paddingHorizontal: 20 },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 4
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPlaceholder,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 20,
    marginBottom: 8
  },
  listContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    padding: 10,
    ...cardShadow
  },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 },
  dangerRow: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
    backgroundColor: colors.dangerBg,
    borderRadius: radii.item,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.15)',
    paddingVertical: 14,
    alignItems: 'center'
  },
  dangerText: { color: colors.danger, fontWeight: '600', fontSize: 14 }
})
