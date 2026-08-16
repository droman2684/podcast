import { useState } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Grid2x2, List, ChevronRight } from 'lucide-react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import { colors, radii, cardShadow } from '../theme'

type ViewMode = 'grid' | 'list'
const GRID_COLUMNS = 3

interface Props {
  onSelectPodcast: (id: string) => void
  onOpenSettings: (id: string) => void
}

export default function LibraryScreen({ onSelectPodcast, onOpenSettings }: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const loading = useStore((s) => s.libraryLoading)
  const error = useStore((s) => s.libraryError)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const unsubscribe = useStore((s) => s.unsubscribe)
  const defaultLibraryView = useStore((s) => s.defaultLibraryView)

  // Seeded from the user's Settings preference. This screen remounts on
  // every tab visit (see comment below), so re-reading the store default
  // here each time is intentional, not a bug.
  const [view, setView] = useState<ViewMode>(defaultLibraryView)

  // The initial load is triggered once at the app root (see App.tsx) rather
  // than here — this screen unmounts and remounts every time the tab bar
  // switches away and back, and re-fetching + re-parsing every subscribed
  // feed on every tab visit was the main source of the app feeling slow.
  // Pull-to-refresh below still re-fetches on demand.

  const renderGridItem = ({ item }: { item: Podcast }): React.JSX.Element => (
    <Pressable style={styles.gridCard} onPress={() => onSelectPodcast(item.id)}>
      <View>
        <Artwork url={item.customArtworkUrl ?? item.artworkUrl} size={GRID_ART_SIZE} radius={radii.artworkSm} />
        {item.unread > 0 && (
          <View style={styles.gridBadge}>
            <Text style={styles.gridBadgeText}>{item.unread}</Text>
          </View>
        )}
      </View>
      <Text style={styles.gridName} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={styles.gridAuthor} numberOfLines={1}>
        {item.author}
      </Text>
    </Pressable>
  )

  const renderListItem = ({ item }: { item: Podcast }): React.JSX.Element => (
    <SwipeToDelete deleteLabel="Unsubscribe" onDelete={() => unsubscribe(item.id)}>
      <Pressable style={styles.listRow} onPress={() => onSelectPodcast(item.id)}>
        <Artwork url={item.customArtworkUrl ?? item.artworkUrl} size={48} radius={radii.artworkSm} />
        <View style={styles.listMeta}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.listAuthor} numberOfLines={1}>
            {item.author}
          </Text>
        </View>
        {item.unread > 0 && (
          <View style={styles.listBadge}>
            <Text style={styles.gridBadgeText}>{item.unread}</Text>
          </View>
        )}
        <Pressable hitSlop={10} onPress={() => onOpenSettings(item.id)}>
          <ChevronRight size={16} color={colors.textDisabled} />
        </Pressable>
      </Pressable>
    </SwipeToDelete>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleBtn, view === 'grid' && styles.toggleBtnActive]}
            onPress={() => setView('grid')}
          >
            <Grid2x2 size={14} color={view === 'grid' ? colors.accent : colors.textPlaceholder} />
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}
            onPress={() => setView('list')}
          >
            <List size={14} color={view === 'list' ? colors.accent : colors.textPlaceholder} />
          </Pressable>
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {view === 'grid' ? (
        <FlatList
          data={podcasts}
          key="grid"
          keyExtractor={(p) => p.id}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          onRefresh={loadLibrary}
          refreshing={loading}
          renderItem={renderGridItem}
          ListEmptyComponent={<EmptyState loading={loading} />}
        />
      ) : (
        <FlatList
          data={podcasts}
          key="list"
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          onRefresh={loadLibrary}
          refreshing={loading}
          renderItem={renderListItem}
          ListEmptyComponent={<EmptyState loading={loading} />}
        />
      )}
    </View>
  )
}

function EmptyState({ loading }: { loading: boolean }): React.JSX.Element {
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} />
  return (
    <Text style={styles.empty}>
      No synced subscriptions found yet. Subscribe on desktop or from the Search tab, then pull
      down to refresh here.
    </Text>
  )
}

const SCREEN_PADDING = 20
const GRID_GAP = 14
// 3 columns matching desktop's `grid-template-columns: repeat(3, 1fr)`.
const GRID_ART_SIZE = 104

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: 16
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#e8e8ed',
    borderRadius: 8,
    padding: 3,
    gap: 2
  },
  toggleBtn: { width: 28, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: '#fff', ...cardShadow },
  error: { color: colors.danger, paddingHorizontal: SCREEN_PADDING, marginBottom: 8 },

  gridContent: { paddingHorizontal: SCREEN_PADDING, paddingBottom: 20 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  gridCard: { flex: 1, maxWidth: `${100 / GRID_COLUMNS}%` },
  gridBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.accent,
    borderRadius: radii.badge,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  gridBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  gridName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 8 },
  gridAuthor: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  listContent: { paddingHorizontal: SCREEN_PADDING, gap: 8, paddingBottom: 20 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    padding: 10,
    ...cardShadow
  },
  listMeta: { flex: 1, minWidth: 0 },
  listName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  listAuthor: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  listBadge: { backgroundColor: colors.accent, borderRadius: radii.badge, paddingHorizontal: 7, paddingVertical: 2 },

  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 }
})
