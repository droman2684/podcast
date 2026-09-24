import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import DraggableFlatList from 'react-native-draggable-flatlist'
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import { sortPodcastsByShowOrder } from '../lib/queueOrder'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  onBack: () => void
  backLabel: string
}

const ROW_HEIGHT = 64

// Ranks the user's shows. The order drives the Library and, in the
// Queue's Auto mode, which show's episodes play first (see
// lib/queueOrder.ts). Same drag-grip + arrow-fallback pattern as the
// Queue's manual reorder.
export default function ShowOrderScreen({ onBack, backLabel }: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const showOrder = useStore((s) => s.showOrder)
  const setShowOrder = useStore((s) => s.setShowOrder)

  const ordered = useMemo(() => sortPodcastsByShowOrder(podcasts, showOrder), [podcasts, showOrder])

  // Always saves the full current list (not just the moved id), so shows
  // that were only implicitly ordered become explicitly ranked from here on.
  const move = (podcastId: string, targetIndex: number): void => {
    const ids = ordered.map((p) => p.id)
    const from = ids.indexOf(podcastId)
    const to = Math.max(0, Math.min(ids.length - 1, targetIndex))
    if (from === -1 || from === to) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    setShowOrder(ids)
  }

  const renderRow = (item: Podcast, index: number, drag: () => void, isActive: boolean): React.JSX.Element => (
    <View style={[styles.row, isActive && styles.rowDragging]}>
      <Pressable hitSlop={8} onLongPress={drag} delayLongPress={150} accessibilityLabel="Drag to reorder">
        <GripVertical size={18} color={colors.textDisabled} />
      </Pressable>
      <Text style={styles.rank}>{index + 1}</Text>
      <Artwork url={item.customArtworkUrl ?? item.artworkUrl} size={40} radius={radii.artworkSm} />
      <Text style={styles.name} numberOfLines={1}>
        {item.name}
      </Text>
      <Pressable
        hitSlop={6}
        disabled={index === 0}
        onPress={() => move(item.id, index - 1)}
        accessibilityLabel={`Move ${item.name} up`}
      >
        <ChevronUp size={20} color={index === 0 ? colors.textDisabled : colors.textMuted} />
      </Pressable>
      <Pressable
        hitSlop={6}
        disabled={index === ordered.length - 1}
        onPress={() => move(item.id, index + 1)}
        accessibilityLabel={`Move ${item.name} down`}
      >
        <ChevronDown size={20} color={index === ordered.length - 1 ? colors.textDisabled : colors.textMuted} />
      </Pressable>
    </View>
  )

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{`‹ ${backLabel}`}</Text>
      </Pressable>
      <Text style={styles.title}>Show Order</Text>
      <Text style={styles.subtitle}>
        In Auto queue mode, episodes from shows higher on this list play first, oldest episode first within each
        show.
      </Text>
      <DraggableFlatList
        data={ordered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        activationDistance={8}
        onDragEnd={({ data }) => setShowOrder(data.map((p) => p.id))}
        renderItem={({ item, drag, isActive, getIndex }) => renderRow(item, getIndex() ?? 0, drag, isActive)}
        ListEmptyComponent={<Text style={styles.empty}>No shows yet — subscribe from Discover.</Text>}
        ListFooterComponent={<View style={{ height: ROW_HEIGHT }} />}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  back: { color: colors.accent, marginBottom: 8, fontSize: 15, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 6 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, paddingHorizontal: 20, marginBottom: 16, lineHeight: 17 },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ROW_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    paddingHorizontal: 10,
    marginBottom: 8,
    ...cardShadow
  },
  rowDragging: { opacity: 0.85 },
  rank: { width: 20, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.textMuted },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 }
})
