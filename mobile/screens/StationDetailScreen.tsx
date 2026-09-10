import { useMemo, useState } from 'react'
import { View, Text, TextInput, FlatList, Pressable, Alert, StyleSheet } from 'react-native'
import DraggableFlatList from 'react-native-draggable-flatlist'
import { Check, Play, GripVertical, Settings } from 'lucide-react-native'
import type { Episode, Podcast, Station, StationSort } from '@shared/types'
import { useStore } from '../state/store'
import { computeStationEpisodes } from '../lib/stationEpisodes'
import Artwork from '../components/Artwork'
import { colors, radii, cardShadow } from '../theme'

interface Props {
  station: Station
  onBack: () => void
  onDeleted: () => void
  onPlay: (podcastId: string, episodeId: string) => void
}

const SORT_OPTIONS: { value: StationSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'longest', label: 'Longest' },
  { value: 'manual', label: 'Manual' }
]

// 0 = All episodes per show (see the Station type's doc comment).
const CAP_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 0, label: 'All' }
]

function formatDuration(sec: number): string {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

export default function StationDetailScreen({ station, onBack, onDeleted, onPlay }: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const renameStation = useStore((s) => s.renameStation)
  const deleteStation = useStore((s) => s.deleteStation)
  const addPodcastToStation = useStore((s) => s.addPodcastToStation)
  const removePodcastFromStation = useStore((s) => s.removePodcastFromStation)
  const updateStationSettings = useStore((s) => s.updateStationSettings)
  const reorderStationEpisodes = useStore((s) => s.reorderStationEpisodes)
  const playStation = useStore((s) => s.playStation)
  const [name, setName] = useState(station.name)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const podcastById = useMemo(() => new Map(podcasts.map((p) => [p.id, p])), [podcasts])
  const memberIds = new Set(station.podcastIds)

  const episodes = useMemo(
    () => computeStationEpisodes(station, episodesByPodcast),
    [station, episodesByPodcast]
  )

  const handleRenameBlur = (): void => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== station.name) {
      setError(null)
      renameStation(station.id, trimmed).catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      )
    } else {
      setName(station.name)
    }
  }

  const handleDelete = async (): Promise<void> => {
    setError(null)
    try {
      await deleteStation(station.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const confirmDelete = (): void => {
    Alert.alert('Delete Station', `Delete "${station.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: handleDelete }
    ])
  }

  const toggleMember = (podcastId: string, included: boolean): void => {
    setError(null)
    const action = included
      ? removePodcastFromStation(station.id, podcastId)
      : addPodcastToStation(station.id, podcastId)
    action.catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  // Play Station starts its own queue (see store.ts's playStation/
  // stationQueue) — it no longer touches the app's main queue.
  const handlePlay = async (): Promise<void> => {
    setError(null)
    setPlaying(true)
    try {
      const first = await playStation(station.id)
      if (first) onPlay(first.podcastId, first.episodeId)
      else setError('No episodes to play — add shows to this station first.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPlaying(false)
    }
  }

  const handlePlayEpisode = async (episodeId: string): Promise<void> => {
    setError(null)
    try {
      const target = await playStation(station.id, episodeId)
      if (target) onPlay(target.podcastId, target.episodeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const renderPodcastRow = ({ item }: { item: Podcast }): React.JSX.Element => {
    const included = memberIds.has(item.id)
    return (
      <Pressable
        style={styles.showRow}
        onPress={() => toggleMember(item.id, included)}
        accessibilityLabel={`${included ? 'Remove' : 'Add'} ${item.name} ${included ? 'from' : 'to'} station`}
      >
        <Artwork url={item.customArtworkUrl ?? item.artworkUrl} size={40} radius={radii.artworkSm} />
        <Text style={styles.showRowName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={[styles.checkbox, included && styles.checkboxOn]}>
          {included && <Check size={13} color="#fff" strokeWidth={3} />}
        </View>
      </Pressable>
    )
  }

  const renderEpisodeRow = (episode: Episode, drag?: () => void, isActive?: boolean): React.JSX.Element => {
    const podcast = podcastById.get(episode.podcastId)
    return (
      <View style={[styles.epRow, isActive && styles.epRowDragging]}>
        {station.sortBy === 'manual' && drag && (
          <Pressable hitSlop={6} onLongPress={drag} delayLongPress={150} accessibilityLabel="Drag to reorder">
            <GripVertical size={16} color={colors.textDisabled} />
          </Pressable>
        )}
        <Pressable style={styles.epRowMain} onPress={() => handlePlayEpisode(episode.id)}>
          <Artwork
            url={podcast?.customArtworkUrl ?? episode.artworkUrl ?? podcast?.artworkUrl ?? null}
            size={40}
            radius={radii.artworkSm}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.epTitle} numberOfLines={1}>
              {episode.title}
            </Text>
            <Text style={styles.epMeta} numberOfLines={1}>
              {podcast?.name ?? 'Unknown show'} · {formatDuration(episode.durationSec)}
              {episode.played ? ' · Played' : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable hitSlop={10} onPress={() => handlePlayEpisode(episode.id)} accessibilityLabel="Play episode">
          <Play size={16} color={colors.accent} fill={colors.accent} />
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>{'‹ Stations'}</Text>
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={() => setShowSettings((v) => !v)}
          accessibilityLabel={showSettings ? 'Hide station settings' : 'Station settings'}
        >
          <Settings size={18} color={showSettings ? colors.accent : colors.textMuted} />
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.title}>{station.name}</Text>

      <Pressable
        style={[styles.playBtn, station.podcastIds.length === 0 && styles.playBtnDisabled]}
        onPress={handlePlay}
        disabled={playing || station.podcastIds.length === 0}
        accessibilityLabel="Play station"
      >
        <Play size={15} color="#fff" fill="#fff" />
        <Text style={styles.playBtnText}>Play Station</Text>
      </Pressable>

      {showSettings && (
        <View style={styles.settingsPanel}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            onBlur={handleRenameBlur}
            onSubmitEditing={handleRenameBlur}
            returnKeyType="done"
            accessibilityLabel="Station name"
          />

          <Text style={styles.sectionTitle}>Sort order</Text>
          <View style={styles.chipRow}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.chip, station.sortBy === opt.value && styles.chipActive]}
                onPress={() => updateStationSettings(station.id, { sortBy: opt.value })}
              >
                <Text style={[styles.chipText, station.sortBy === opt.value && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Episodes per show</Text>
          <View style={styles.chipRow}>
            {CAP_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.chip, station.episodesPerShow === opt.value && styles.chipActive]}
                onPress={() => updateStationSettings(station.id, { episodesPerShow: opt.value })}
              >
                <Text style={[styles.chipText, station.episodesPerShow === opt.value && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Shows in this station</Text>
          <FlatList
            data={podcasts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.showListContent}
            renderItem={renderPodcastRow}
            scrollEnabled={false}
            ListEmptyComponent={<Text style={styles.empty}>Subscribe to shows from Discover to add them here.</Text>}
          />

          <Pressable style={styles.dangerRow} onPress={confirmDelete} accessibilityLabel="Delete station">
            <Text style={styles.dangerText}>Delete Station</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Episodes{station.sortBy === 'manual' ? ' · drag to reorder' : ''}
      </Text>
      {episodes.length === 0 ? (
        <Text style={styles.empty}>
          {station.podcastIds.length === 0
            ? 'Add shows to this station to see episodes here.'
            : 'No episodes yet from these shows.'}
        </Text>
      ) : station.sortBy === 'manual' ? (
        <DraggableFlatList
          data={episodes}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.epListContent}
          activationDistance={8}
          onDragEnd={({ data }) => reorderStationEpisodes(station.id, data.map((e) => e.id))}
          renderItem={({ item, drag, isActive }) => renderEpisodeRow(item, drag, isActive)}
        />
      ) : (
        <FlatList
          data={episodes}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.epListContent}
          renderItem={({ item }) => renderEpisodeRow(item)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4
  },
  back: { color: colors.accent, fontSize: 15 },
  error: { color: colors.danger, fontSize: 12, paddingHorizontal: 20, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 20, marginBottom: 12 },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: 12
  },
  playBtnDisabled: { backgroundColor: colors.textDisabled },
  playBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  settingsPanel: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    borderRadius: radii.item,
    backgroundColor: colors.surface,
    ...cardShadow
  },
  nameInput: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textPrimary },
  chipTextActive: { color: '#fff' },
  showListContent: { gap: 8, paddingBottom: 4 },
  showRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: radii.item,
    padding: 10
  },
  showRowName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
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
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20, paddingHorizontal: 30 },
  dangerRow: {
    marginTop: 12,
    backgroundColor: colors.dangerBg,
    borderRadius: radii.item,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.15)',
    paddingVertical: 14,
    alignItems: 'center'
  },
  dangerText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
  epListContent: { paddingHorizontal: 20, gap: 8, paddingBottom: 30 },
  epRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.item,
    padding: 10,
    ...cardShadow
  },
  epRowDragging: { opacity: 0.85 },
  epRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  epTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  epMeta: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 }
})
