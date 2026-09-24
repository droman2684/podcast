import { useState } from 'react'
import { X, GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import { sortPodcastsByShowOrder } from '@shared/queueView'
import styles from './ShowOrderModal.module.css'

// Ranks the user's shows (drag a row, or use the arrows). The ranking drives
// the Library's order and the Queue's "Show order" sort. Every change saves
// immediately — the full ranked list is stored, so shows subscribed later
// just append at the bottom until moved.
function ShowOrderModal(): React.JSX.Element | null {
  const open = useAppStore((s) => s.showOrderModalOpen)
  const close = useAppStore((s) => s.closeShowOrderModal)
  const podcasts = useAppStore((s) => s.podcasts)
  const showOrder = useAppStore((s) => s.showOrder)
  const setShowOrder = useAppStore((s) => s.setShowOrder)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  if (!open) return null

  const ordered = sortPodcastsByShowOrder(podcasts, showOrder)
  const ids = ordered.map((p) => p.id)

  const move = (fromIdx: number, toIdx: number): void => {
    if (toIdx < 0 || toIdx >= ids.length || fromIdx === toIdx) return
    const next = [...ids]
    const [id] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, id)
    setShowOrder(next)
  }

  // Drops land *before* the target row, matching the drop indicator.
  const dropBefore = (fromId: string, targetId: string): void => {
    if (fromId === targetId) return
    const next = ids.filter((id) => id !== fromId)
    next.splice(next.indexOf(targetId), 0, fromId)
    setShowOrder(next)
  }

  const endDrag = (): void => {
    setDragId(null)
    setDragOverId(null)
  }

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <div className={styles.title}>Show order</div>
            <div className={styles.subtitle}>
              Sets the Library order and the Queue&apos;s &ldquo;Show order&rdquo; sort
            </div>
          </div>
          <div className={styles.closeBtn} onClick={close}>
            <X size={14} color="#6e6e73" />
          </div>
        </div>

        {ordered.length === 0 ? (
          <div className={styles.empty}>Subscribe to a podcast to rank your shows.</div>
        ) : (
          <div className={styles.list}>
            {ordered.map((p, i) => (
              <div
                key={p.id}
                className={`${styles.row} ${dragOverId === p.id && dragId !== p.id ? styles.rowDropTarget : ''}`}
                style={{ opacity: dragId === p.id ? 0.45 : 1 }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDragId(p.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragOverId !== p.id) setDragOverId(p.id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragId !== null) dropBefore(dragId, p.id)
                  endDrag()
                }}
                onDragEnd={endDrag}
              >
                <span className={styles.grip}>
                  <GripVertical size={15} color="#c7c7cc" />
                </span>
                <span className={styles.rank}>{i + 1}</span>
                <PodcastArtwork
                  artworkUrl={p.customArtworkUrl ?? p.artworkUrl}
                  fallbackLabel={p.name}
                  size={36}
                  radius={7}
                />
                <div className={styles.name}>{p.name}</div>
                <button
                  type="button"
                  className={styles.arrowBtn}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  title="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className={styles.arrowBtn}
                  disabled={i === ordered.length - 1}
                  onClick={() => move(i, i + 1)}
                  title="Move down"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ShowOrderModal
