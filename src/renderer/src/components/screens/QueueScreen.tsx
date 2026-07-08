import { useState } from 'react'
import { GripVertical, X, Play, Pause, ChevronRight } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import EpisodeArtwork from '@renderer/components/ui/EpisodeArtwork'
import Pill from '@renderer/components/ui/Pill'
import SectionLabel from '@renderer/components/ui/SectionLabel'
import { formatDurationLabel } from '@renderer/utils/duration'
import { computeProgress } from '@renderer/utils/progress'
import { sortEpisodes, groupByPodcast, type QueueSortMode } from '@shared/queueView'
import type { Episode } from '@renderer/types'
import styles from './QueueScreen.module.css'

const SORT_OPTIONS: { value: QueueSortMode; label: string }[] = [
  { value: 'manual', label: 'Manual (drag order)' },
  { value: 'newest', label: 'Date — newest first' },
  { value: 'oldest', label: 'Date — oldest first' },
  { value: 'shortest', label: 'Length — shortest first' },
  { value: 'longest', label: 'Length — longest first' }
]

function QueueScreen(): React.JSX.Element {
  const queue = useAppStore((s) => s.queue)
  const podcasts = useAppStore((s) => s.podcasts)
  const episodesByPodcast = useAppStore((s) => s.episodesByPodcast)
  const queueDragId = useAppStore((s) => s.queueDragId)
  const queueDragOverId = useAppStore((s) => s.queueDragOverId)
  const setQueueDragId = useAppStore((s) => s.setQueueDragId)
  const setQueueDragOverId = useAppStore((s) => s.setQueueDragOverId)
  const reorderQueue = useAppStore((s) => s.reorderQueue)
  const removeFromQueue = useAppStore((s) => s.removeFromQueue)
  const clearQueue = useAppStore((s) => s.clearQueue)
  const currentEpisodeId = useAppStore((s) => s.currentEpisodeId)
  const playing = useAppStore((s) => s.playing)
  const playFromQueue = useAppStore((s) => s.playFromQueue)
  const togglePlay = useAppStore((s) => s.togglePlay)
  const positions = useAppStore((s) => s.positions)
  const currentTimeSec = useAppStore((s) => s.currentTimeSec)

  const [sortMode, setSortMode] = useState<QueueSortMode>('manual')
  const [filterPodcastId, setFilterPodcastId] = useState<string>('all')
  const [groupByShow, setGroupByShow] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (episodeId: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(episodeId)) next.delete(episodeId)
      else next.add(episodeId)
      return next
    })
  }

  const podcastById = Object.fromEntries(podcasts.map((p) => [p.id, p]))
  const allEpisodes = Object.values(episodesByPodcast).flat()
  const episodeById = Object.fromEntries(allEpisodes.map((e) => [e.id, e]))

  // The canonical playback order. Note this can be a strict subset of the
  // real queue array — a queue id that no longer resolves to a loaded
  // episode (e.g. its podcast was unsubscribed) is silently dropped here.
  // Reordering must never rely on this list's *positions* lining up with
  // the real queue array; see reorderQueue's id-based design.
  const items = queue.map((id) => episodeById[id]).filter((e) => e !== undefined)

  const showsInQueue = Array.from(new Set(items.map((e) => e.podcastId)))
    .map((id) => podcastById[id])
    .filter((p) => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))

  const filtered =
    filterPodcastId === 'all' ? items : items.filter((e) => e.podcastId === filterPodcastId)
  const visible = sortEpisodes(filtered, sortMode)

  // Manual reordering (drag-and-drop) is only offered when the view is
  // showing the raw queue order 1:1 — any filter, sort, or grouping means a
  // dropped position on screen no longer corresponds to the real array.
  const manualOrderActive = sortMode === 'manual' && filterPodcastId === 'all' && !groupByShow

  const handlePlayToggle = (episodeId: string): void => {
    if (currentEpisodeId === episodeId) togglePlay()
    else playFromQueue(episodeId)
  }

  const renderRow = (episode: Episode, isFirst: boolean): React.JSX.Element => {
    const isDragging = queueDragId === episode.id
    const isDropTarget = queueDragOverId === episode.id && queueDragId !== episode.id
    const isPlaying = currentEpisodeId === episode.id && playing
    const podcast = podcastById[episode.podcastId]
    const progress = computeProgress(episode, positions, currentEpisodeId, currentTimeSec)
    const isExpanded = expandedIds.has(episode.id)
    const publishedLabel = new Date(episode.pubDateIso).toLocaleDateString()

    return (
      <div key={episode.id}>
        <div
          className={styles.row}
          draggable={manualOrderActive}
          onClick={() => handlePlayToggle(episode.id)}
          onDragStart={(e) => {
            if (!manualOrderActive) return
            e.dataTransfer.effectAllowed = 'move'
            setQueueDragId(episode.id)
          }}
          onDragOver={(e) => {
            if (!manualOrderActive) return
            e.preventDefault()
            if (queueDragOverId !== episode.id) setQueueDragOverId(episode.id)
          }}
          onDrop={(e) => {
            if (!manualOrderActive) return
            e.preventDefault()
            if (queueDragId === null) return
            reorderQueue(queueDragId, episode.id)
          }}
          onDragEnd={() => {
            setQueueDragId(null)
            setQueueDragOverId(null)
          }}
          style={{
            background: isDragging ? 'rgba(255,89,16,.07)' : isFirst ? '#fff7f2' : '#ffffff',
            border: isExpanded
              ? '1px solid var(--color-border-strong)'
              : isDropTarget
                ? '2px solid var(--color-accent)'
                : '1px solid rgba(0,0,0,.07)',
            borderBottom: isExpanded ? 'none' : undefined,
            borderRadius: isExpanded ? '10px 10px 0 0' : undefined,
            opacity: isDragging ? 0.45 : 1,
            cursor: 'pointer'
          }}
        >
          {manualOrderActive ? (
            <span className={styles.grip} onClick={(e) => e.stopPropagation()}>
              <GripVertical size={15} color="#d1d1d6" />
            </span>
          ) : (
            <div style={{ width: 15 }} />
          )}
          <div className={styles.pos} style={{ color: 'var(--color-accent)' }}>
            {isPlaying ? <Pause size={13} fill="var(--color-accent)" /> : <Play size={13} fill="var(--color-accent)" />}
          </div>
          <EpisodeArtwork
            artworkUrl={podcast?.customArtworkUrl ?? episode.artworkUrl}
            fallbackLabel={podcast?.name ?? episode.title}
            size={46}
            radius={8}
            progress={progress}
          />
          <div className={styles.meta}>
            <div className={styles.epTitle}>{episode.title}</div>
            <div className={styles.epSub}>
              {podcast?.name} · {publishedLabel} · {formatDurationLabel(episode.durationSec)}
            </div>
          </div>
          <div
            className={styles.expandBtn}
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(episode.id)
            }}
            style={isExpanded ? { opacity: 1 } : undefined}
            title={isExpanded ? 'Collapse' : 'Show full title and description'}
          >
            <ChevronRight
              size={14}
              color="#8e8e93"
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.12s ease'
              }}
            />
          </div>
          <div
            className={styles.removeBtn}
            onClick={(e) => {
              e.stopPropagation()
              removeFromQueue(episode.id)
            }}
          >
            <X size={13} color="#8e8e93" />
          </div>
        </div>
        {isExpanded && (
          <div className={styles.expandedPanel}>
            <div className={styles.expandedTitle}>{episode.title}</div>
            <div className={styles.expandedMeta}>
              {podcast?.name} · {publishedLabel} · {formatDurationLabel(episode.durationSec)}
            </div>
            <div className={styles.expandedDescription}>
              {episode.description || 'No description available.'}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderFlatList = (episodes: Episode[]): React.JSX.Element => (
    <div className={styles.list}>
      {episodes.map((episode, i) => renderRow(episode, i === 0))}
    </div>
  )

  let groupedContent: React.JSX.Element
  if (groupByShow) {
    const groups = groupByPodcast(visible)
    groupedContent = (
      <>
        {groups.map((group) => (
          <div key={group.podcastId} style={{ marginBottom: 18 }}>
            <SectionLabel>{podcastById[group.podcastId]?.name ?? 'Unknown show'}</SectionLabel>
            <div style={{ marginTop: 8 }}>{renderFlatList(group.episodes)}</div>
          </div>
        ))}
      </>
    )
  } else {
    groupedContent = renderFlatList(visible)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.title}>Queue</div>
          <div className={styles.count}>
            {filterPodcastId === 'all' ? `${items.length} episodes` : `${visible.length} of ${items.length} shown`}
          </div>
        </div>
        <Pill variant="ghost" onClick={clearQueue}>
          Clear all
        </Pill>
      </div>

      {items.length > 0 && (
        <div className={styles.controls}>
          <select
            className={styles.select}
            value={filterPodcastId}
            onChange={(e) => setFilterPodcastId(e.target.value)}
          >
            <option value="all">All shows</option>
            {showsInQueue.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as QueueSortMode)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <label className={styles.groupLabel}>
            <input
              type="checkbox"
              checked={groupByShow}
              onChange={(e) => setGroupByShow(e.target.checked)}
            />
            Group by show
          </label>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          Your queue is empty — add episodes from a podcast&apos;s Episodes screen.
        </div>
      )}

      {items.length > 0 && visible.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          No episodes match this filter.
        </div>
      )}

      {visible.length > 0 && groupedContent}
    </div>
  )
}

export default QueueScreen
