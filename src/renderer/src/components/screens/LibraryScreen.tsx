import { Grid2x2, List, ChevronRight } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import styles from './LibraryScreen.module.css'

function LibraryScreen(): React.JSX.Element {
  const libraryView = useAppStore((s) => s.libraryView)
  const setLibraryView = useAppStore((s) => s.setLibraryView)
  const goTo = useAppStore((s) => s.goTo)
  const podcasts = useAppStore((s) => s.podcasts)

  const openPodcast = (id: string): void => goTo('episode', id)

  if (podcasts.length === 0) {
    return (
      <div className={styles.screen}>
        <div className={styles.title} style={{ marginBottom: 12 }}>
          Library
        </div>
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          Nothing here yet — subscribe to a podcast from Search.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.title}>Library</div>
        <div className={styles.toggle}>
          <div
            className={styles.toggleBtn}
            style={{
              background: libraryView === 'grid' ? '#fff' : 'transparent',
              boxShadow: libraryView === 'grid' ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
            }}
            onClick={() => setLibraryView('grid')}
          >
            <Grid2x2 size={14} color={libraryView === 'grid' ? 'var(--color-accent)' : '#aeaeb2'} />
          </div>
          <div
            className={styles.toggleBtn}
            style={{
              background: libraryView === 'list' ? '#fff' : 'transparent',
              boxShadow: libraryView === 'list' ? '0 1px 3px rgba(0,0,0,.12)' : 'none'
            }}
            onClick={() => setLibraryView('list')}
          >
            <List size={14} color={libraryView === 'list' ? 'var(--color-accent)' : '#aeaeb2'} />
          </div>
        </div>
      </div>

      {libraryView === 'grid' ? (
        <div className={styles.grid}>
          {podcasts.map((p) => (
            <div className={styles.gridCard} key={p.id} onClick={() => openPodcast(p.id)}>
              <div style={{ position: 'relative' }}>
                <PodcastArtwork artworkUrl={p.customArtworkUrl ?? p.artworkUrl} fallbackLabel={p.name} size="fill" />
                {p.unread > 0 && <div className={styles.gridBadge}>{p.unread}</div>}
              </div>
              <div className={styles.gridName}>{p.name}</div>
              <div className={styles.gridAuthor}>{p.author}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.list}>
          {podcasts.map((p) => (
            <div className={styles.listRow} key={p.id} onClick={() => openPodcast(p.id)}>
              <PodcastArtwork artworkUrl={p.customArtworkUrl ?? p.artworkUrl} fallbackLabel={p.name} size={48} radius={9} />
              <div className={styles.listMeta}>
                <div className={styles.listName}>{p.name}</div>
                <div className={styles.listAuthor}>{p.author}</div>
              </div>
              {p.unread > 0 && (
                <span
                  style={{
                    background: 'var(--color-accent)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 10,
                    padding: '2px 7px'
                  }}
                >
                  {p.unread}
                </span>
              )}
              <ChevronRight size={14} color="#c7c7cc" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LibraryScreen
