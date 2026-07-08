import { useEffect, useState } from 'react'
import { Search as SearchIcon, X, ChevronLeft } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import { categories } from '@renderer/data/categories'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import Pill from '@renderer/components/ui/Pill'
import SectionLabel from '@renderer/components/ui/SectionLabel'
import { formatDurationLabel } from '@renderer/utils/duration'
import type { Episode, PodcastPreview } from '@renderer/types'
import styles from './SearchScreen.module.css'

const DEBOUNCE_MS = 400

function SearchScreen(): React.JSX.Element {
  const searchTerm = useAppStore((s) => s.searchTerm)
  const setSearchTerm = useAppStore((s) => s.setSearchTerm)
  const search = useAppStore((s) => s.search)
  const discoverResults = useAppStore((s) => s.discoverResults)
  const searching = useAppStore((s) => s.searching)
  const podcasts = useAppStore((s) => s.podcasts)
  const subscribe = useAppStore((s) => s.subscribe)

  const [previewFeedUrl, setPreviewFeedUrl] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{
    podcast: PodcastPreview
    episodes: Episode[]
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => search(searchTerm), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchTerm, search])

  const subscribedFeedUrls = new Set(podcasts.map((p) => p.feedUrl))
  const showBrowse = !searchTerm.trim()

  const handlePreview = async (feedUrl: string): Promise<void> => {
    setPreviewFeedUrl(feedUrl)
    setPreviewData(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const data = await window.api.search.preview(feedUrl)
      setPreviewData(data)
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to load this podcast')
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = (): void => {
    setPreviewFeedUrl(null)
    setPreviewData(null)
    setPreviewError(null)
  }

  if (previewFeedUrl) {
    const subbed = subscribedFeedUrls.has(previewFeedUrl)
    return (
      <div className={styles.screen}>
        <div className={styles.backRow} onClick={closePreview}>
          <ChevronLeft size={15} /> Back to results
        </div>

        {previewLoading && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>
        )}

        {previewError && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{previewError}</div>
        )}

        {previewData && (
          <>
            <div className={styles.previewHeader}>
              <PodcastArtwork
                artworkUrl={previewData.podcast.artworkUrl}
                fallbackLabel={previewData.podcast.name}
                size={88}
                radius={13}
                shadow="var(--shadow-now-playing-art)"
              />
              <div className={styles.previewHeaderMeta}>
                <div className={styles.previewName}>{previewData.podcast.name}</div>
                <div className={styles.resultSub}>
                  {previewData.podcast.author} · {previewData.podcast.category}
                </div>
                <Pill
                  variant={subbed ? 'secondary' : 'primary'}
                  onClick={() => !subbed && subscribe(previewFeedUrl)}
                >
                  {subbed ? 'Subscribed' : 'Subscribe'}
                </Pill>
              </div>
            </div>

            {previewData.podcast.description && (
              <div className={styles.previewDescription}>{previewData.podcast.description}</div>
            )}

            <div>
              <SectionLabel>Episodes</SectionLabel>
              <div className={styles.previewList} style={{ marginTop: 10 }}>
                {previewData.episodes.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    No episodes found in this feed.
                  </div>
                )}
                {previewData.episodes.map((ep) => (
                  <div className={styles.previewRow} key={ep.id}>
                    <div className={styles.previewRowTitle}>{ep.title}</div>
                    <div className={styles.resultSub}>
                      {new Date(ep.pubDateIso).toLocaleDateString()} ·{' '}
                      {formatDurationLabel(ep.durationSec)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <div className={styles.searchBar}>
        <SearchIcon size={15} style={{ opacity: 0.4 }} />
        <input
          className={styles.searchInput}
          placeholder="Search podcasts, hosts, or categories"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <div className={styles.clearBtn} onClick={() => setSearchTerm('')}>
            <X size={12} color="#6e6e73" />
          </div>
        )}
      </div>

      {showBrowse && (
        <div>
          <SectionLabel>Browse Categories</SectionLabel>
          <div className={styles.categoryGrid} style={{ marginTop: 10 }}>
            {categories.map((c) => (
              <div
                key={c.label}
                className={styles.categoryChip}
                style={{ background: c.bg, color: c.cl }}
                onClick={() => setSearchTerm(c.label)}
              >
                {c.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {!showBrowse && searching && (
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Searching…</div>
      )}

      {!showBrowse && !searching && (
        <div className={styles.resultsList}>
          {discoverResults.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              No podcasts found for &ldquo;{searchTerm}&rdquo;
            </div>
          )}
          {discoverResults.map((p) => {
            const subbed = subscribedFeedUrls.has(p.feedUrl)
            return (
              <div
                className={styles.resultRow}
                key={p.id}
                onClick={() => handlePreview(p.feedUrl)}
                style={{ cursor: 'pointer' }}
              >
                <PodcastArtwork artworkUrl={p.artworkUrl} fallbackLabel={p.name} size={54} radius={11} />
                <div className={styles.resultMeta}>
                  <div className={styles.resultName}>{p.name}</div>
                  <div className={styles.resultSub}>
                    {p.author} · {p.category}
                  </div>
                </div>
                <Pill
                  variant={subbed ? 'secondary' : 'primary'}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!subbed) subscribe(p.feedUrl)
                  }}
                >
                  {subbed ? 'Subscribed' : 'Subscribe'}
                </Pill>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default SearchScreen
