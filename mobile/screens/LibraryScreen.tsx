import { useMemo, useState } from 'react'
import { View, Text, FlatList, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Grid2x2, List, Tags, ChevronRight, Settings } from 'lucide-react-native'
import type { Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from '../components/Artwork'
import SwipeToDelete from '../components/SwipeToDelete'
import { colors, radii, cardShadow } from '../theme'

type ViewMode = 'grid' | 'list' | 'category'
const GRID_COLUMNS = 3
const UNCATEGORIZED_ID = '__uncategorized'

interface Props {
  onSelectPodcast: (id: string) => void
  onOpenSettings: (id: string) => void
  onOpenAppSettings: () => void
  onManageCategories: () => void
}

export default function LibraryScreen({
  onSelectPodcast,
  onOpenSettings,
  onOpenAppSettings,
  onManageCategories
}: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const loading = useStore((s) => s.libraryLoading)
  const error = useStore((s) => s.libraryError)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const unsubscribe = useStore((s) => s.unsubscribe)
  const defaultLibraryView = useStore((s) => s.defaultLibraryView)
  const stations = useStore((s) => s.stations)

  // Seeded from the user's Settings preference. This screen remounts on
  // every tab visit (see comment below), so re-reading the store default
  // here each time is intentional, not a bug.
  const [view, setView] = useState<ViewMode>(defaultLibraryView)

  // A podcast can belong to more than one category (mirrors desktop's
  // Stations, which this reuses — see the store's stations comment), so it
  // can legitimately appear under more than one header here. Anything in
  // zero categories falls into a trailing "Uncategorized" group.
  const categoryGroups = useMemo(() => {
    const byId = new Map(podcasts.map((p) => [p.id, p]))
    const groups = stations.map((station) => ({
      id: station.id,
      name: station.name,
      podcasts: station.podcastIds.map((id) => byId.get(id)).filter((p): p is Podcast => p !== undefined)
    }))
    const categorized = new Set(stations.flatMap((s) => s.podcastIds))
    const uncategorized = podcasts.filter((p) => !categorized.has(p.id))
    if (uncategorized.length > 0) {
      groups.push({ id: UNCATEGORIZED_ID, name: 'Uncategorized', podcasts: uncategorized })
    }
    return groups
  }, [stations, podcasts])

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
        <Pressable hitSlop={10} onPress={onOpenAppSettings}>
          <Settings size={20} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.toolbar}>
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
          <Pressable
            style={[styles.toggleBtn, view === 'category' && styles.toggleBtnActive]}
            onPress={() => setView('category')}
          >
            <Tags size={14} color={view === 'category' ? colors.accent : colors.textPlaceholder} />
          </Pressable>
        </View>
        <Pressable onPress={onManageCategories}>
          <Text style={styles.manageLink}>Manage categories</Text>
        </Pressable>
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
      ) : view === 'list' ? (
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
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {categoryGroups.length === 0 ? (
            <EmptyState loading={loading} />
          ) : (
            categoryGroups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text style={styles.groupHeader}>{group.name}</Text>
                {group.podcasts.map((item) => (
                  <View key={item.id} style={{ marginBottom: 8 }}>
                    {renderListItem({ item })}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
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
    marginBottom: 12
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PADDING,
    marginBottom: 16
  },
  manageLink: { fontSize: 12.5, fontWeight: '600', color: colors.accent },
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

  group: { marginBottom: 18 },
  groupHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },

  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40, paddingHorizontal: 30 }
})
