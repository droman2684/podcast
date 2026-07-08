import { useState } from 'react'
import { X, Check, ChevronDown, ChevronUp, Play } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import Pill from '@renderer/components/ui/Pill'
import EpisodeArtwork from '@renderer/components/ui/EpisodeArtwork'
import { formatDurationLabel } from '@renderer/utils/duration'
import { computeProgress } from '@renderer/utils/progress'
import { computeStationEpisodes } from '@renderer/utils/stationEpisodes'
import type { Station, StationSort } from '@renderer/types'
import styles from './StationsScreen.module.css'

const STATION_COLORS = ['var(--color-brand)', 'var(--color-accent)', '#8B5CF6', '#10B981', '#EC4899']

function colorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return STATION_COLORS[Math.abs(hash) % STATION_COLORS.length]
}

const SORT_OPTIONS: { value: StationSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'shortest', label: 'Shortest first' },
  { value: 'longest', label: 'Longest first' }
]

const EPISODES_PER_SHOW_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 0, label: 'All' }
]

interface StationCardProps {
  station: Station
  expanded: boolean
  onToggleExpand: () => void
}

function StationCard({ station, expanded, onToggleExpand }: StationCardProps): React.JSX.Element {
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const deleteStation = useAppStore((s) => s.deleteStation)
  const addPodcastToStation = useAppStore((s) => s.addPodcastToStation)
  const removePodcastFromStation = useAppStore((s) => s.removePodcastFromStation)
  const updateStationSettings = useAppStore((s) => s.updateStationSettings)
  const setQueueDirect = useAppStore((s) => s.setQueueDirect)
  const loadEpisode = useAppStore((s) => s.loadEpisode)
  const positions = useAppStore((s) => s.positions)
  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const currentTimeSec = useAppStore((s) => s.currentTimeSec)

  const podcastById = Object.fromEntries(podcasts.map((p) => [p.id, p]))
  const computed = computeStationEpisodes(station, episodesByPodcast)
  const totalSec = computed.reduce((sum, e) => sum + e.durationSec, 0)

  const handlePlay = (): void => {
    if (computed.length === 0) return
    setQueueDirect(computed.slice(1).map((e) => e.id))
    loadEpisode(computed[0].id, { autoplay: true })
  }

  const handlePlayFrom = (index: number): void => {
    setQueueDirect(computed.slice(index + 1).map((e) => e.id))
    loadEpisode(computed[index].id, { autoplay: true })
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} onClick={onToggleExpand}>
        <div className={styles.icon} style={{ background: colorFor(station.name) }} />
        <div className={styles.meta}>
          <div className={styles.name}>{station.name}</div>
          <div className={styles.sub}>
            {station.podcastIds.length} shows · {computed.length} episodes
            {totalSec > 0 ? ` · ${formatDurationLabel(totalSec)}` : ''}
          </div>
        </div>
        <div className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); handlePlay() }} title="Play station">
          <Play size={14} color="var(--color-accent)" fill="var(--color-accent)" />
        </div>
        <div className={styles.iconBtn} onClick={(e) => { e.stopPropagation(); deleteStation(station.id) }}>
          <X size={13} color="#8e8e93" />
        </div>
        {expanded ? <ChevronUp size={14} color="#c7c7cc" /> : <ChevronDown size={14} color="#c7c7cc" />}
      </div>

      {expanded && (
        <div className={styles.editPanel}>
          <div>
            <div className={styles.fieldLabel}>Shows in this station</div>
            <div className={styles.podcastList}>
              {podcasts.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Subscribe to a podcast first.
                </div>
              )}
              {podcasts.map((p) => {
                const included = station.podcastIds.includes(p.id)
                return (
                  <div
                    key={p.id}
                    className={styles.podcastRow}
                    onClick={() =>
                      included
                        ? removePodcastFromStation(station.id, p.id)
                        : addPodcastToStation(station.id, p.id)
                    }
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        border: included ? 'none' : '1.5px solid var(--color-border-strong)',
                        background: included ? 'var(--color-accent)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {included && <Check size={13} color="#fff" />}
                    </div>
                    <span className={styles.podcastName}>{p.name}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className={styles.settingsRow}>
            <div>
              <div className={styles.fieldLabel}>Sort by</div>
              <select
                className={styles.select}
                value={station.sortBy}
                onChange={(e) =>
                  updateStationSettings(station.id, { sortBy: e.target.value as StationSort })
                }
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className={styles.fieldLabel}>Episodes per show</div>
              <div className={styles.countPills}>
                {EPISODES_PER_SHOW_OPTIONS.map((opt) => {
                  const active = station.episodesPerShow === opt.value
                  return (
                    <div
                      key={opt.value}
                      className={styles.countPill}
                      style={{
                        background: active ? 'var(--color-accent)' : '#f0f0f5',
                        color: active ? '#fff' : '#48484a'
                      }}
                      onClick={() => updateStationSettings(station.id, { episodesPerShow: opt.value })}
                    >
                      {opt.label}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <div className={styles.fieldLabel}>
              Queue {computed.length > 0 ? `(${computed.length} episodes)` : ''}
            </div>
            {computed.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Add a show above to build this station&apos;s queue.
              </div>
            ) : (
              <div className={styles.queueList}>
                {computed.map((episode, i) => (
                  <div
                    className={styles.queueRow}
                    key={episode.id}
                    onClick={() => handlePlayFrom(i)}
                  >
                    <EpisodeArtwork
                      artworkUrl={podcastById[episode.podcastId]?.customArtworkUrl ?? episode.artworkUrl}
                      fallbackLabel={podcastById[episode.podcastId]?.name ?? episode.title}
                      size={36}
                      radius={7}
                      progress={computeProgress(episode, positions, currentEpisodeId, currentTimeSec)}
                    />
                    <div className={styles.queueMeta}>
                      <div className={styles.queueTitle}>{episode.title}</div>
                      <div className={styles.queueSub}>
                        {podcastById[episode.podcastId]?.name} ·{' '}
                        {formatDurationLabel(episode.durationSec)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StationsScreen(): React.JSX.Element {
  const stations = useAppStore((s) => s.stations)
  const createStation = useAppStore((s) => s.createStation)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleCreate = (): void => {
    if (!newName.trim()) return
    createStation(newName.trim())
    setNewName('')
    setShowNewForm(false)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Stations</div>
          <div className={styles.subtitle}>Custom playlists built from your subscriptions</div>
        </div>
        <Pill variant="primary" onClick={() => setShowNewForm((v) => !v)}>
          + New Station
        </Pill>
      </div>

      {showNewForm && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            autoFocus
            placeholder="Station name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            style={{
              flex: 1,
              border: '1px solid var(--color-border-strong)',
              borderRadius: 10,
              padding: '9px 12px',
              fontSize: 13,
              background: 'var(--color-surface)',
              outline: 'none'
            }}
          />
          <Pill variant="primary" onClick={handleCreate}>
            Create
          </Pill>
        </div>
      )}

      {stations.length === 0 && !showNewForm && (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          No stations yet — create one, then add shows and pick a sort order and episodes-per-show
          limit to build a custom playlist.
        </div>
      )}

      <div className={styles.list}>
        {stations.map((st) => (
          <StationCard
            key={st.id}
            station={st}
            expanded={expandedId === st.id}
            onToggleExpand={() => setExpandedId((id) => (id === st.id ? null : st.id))}
          />
        ))}
      </div>
    </div>
  )
}

export default StationsScreen
