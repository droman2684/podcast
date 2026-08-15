import { useEffect, useState } from 'react'
import { Shuffle, Search as SearchIcon, X } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import { categories } from '@renderer/data/categories'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import Pill from '@renderer/components/ui/Pill'
import SectionLabel from '@renderer/components/ui/SectionLabel'
import { formatDurationLabel } from '@renderer/utils/duration'
import styles from './RecommendationsScreen.module.css'

const DEBOUNCE_MS = 400

function timeAgoLabel(pubDateIso: string): string {
  const hours = Math.max(0, Math.round((Date.now() - new Date(pubDateIso).getTime()) / (60 * 60 * 1000)))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function RecommendationsScreen(): React.JSX.Element {
  const podcasts = useAppStore((s) => s.podcasts)
  const subscribe = useAppStore((s) => s.subscribe)
  const dailyPick = useAppStore((s) => s.dailyPick)
  const dailyPickLoading = useAppStore((s) => s.dailyPickLoading)
  const loadDailyPick = useAppStore((s) => s.loadDailyPick)
  const activePicksSource = useAppStore((s) => s.activePicksSource)
  const categoryPicks = useAppStore((s) => s.categoryPicks)
  const categoryPicksLoading = useAppStore((s) => s.categoryPicksLoading)
  const pickRecCategory = useAppStore((s) => s.pickRecCategory)
  const pickRecKeyword = useAppStore((s) => s.pickRecKeyword)
  const shuffleCategoryPicks = useAppStore((s) => s.shuffleCategoryPicks)
  const trendingCategory = useAppStore((s) => s.trendingCategory)
  const trendingEpisodes = useAppStore((s) => s.trendingEpisodes)
  const trendingEpisodesLoading = useAppStore((s) => s.trendingEpisodesLoading)
  const pickTrendingCategory = useAppStore((s) => s.pickTrendingCategory)

  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    if (!dailyPick) loadDailyPick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const trimmed = keyword.trim()
    if (!trimmed) return
    const timer = setTimeout(() => pickRecKeyword(trimmed), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [keyword, pickRecKeyword])

  const subscribedFeedUrls = new Set(podcasts.map((p) => p.feedUrl))

  const picksTitle =
    activePicksSource?.type === 'category'
      ? `Top in ${activePicksSource.value}`
      : activePicksSource?.type === 'keyword'
        ? `Matching “${activePicksSource.value}”`
        : ''

  return (
    <div className={styles.screen}>
      <div className={styles.title}>Recommendations</div>

      <div>
        <SectionLabel>Pick of the Day</SectionLabel>
        <div style={{ marginTop: 10 }}>
          {dailyPickLoading && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>
          )}
          {!dailyPickLoading && dailyPick && (
            <div className={styles.pickRow}>
              <PodcastArtwork
                artworkUrl={dailyPick.artworkUrl}
                fallbackLabel={dailyPick.name}
                size={54}
                radius={11}
              />
              <div className={styles.pickMeta}>
                <div className={styles.pickName}>{dailyPick.name}</div>
                <div className={styles.pickSub}>
                  {dailyPick.author}
                  {dailyPick.category ? ` · ${dailyPick.category}` : ''}
                </div>
              </div>
              <Pill
                variant={subscribedFeedUrls.has(dailyPick.feedUrl) ? 'secondary' : 'primary'}
                onClick={() => !subscribedFeedUrls.has(dailyPick.feedUrl) && subscribe(dailyPick.feedUrl)}
              >
                {subscribedFeedUrls.has(dailyPick.feedUrl) ? 'Subscribed' : 'Subscribe'}
              </Pill>
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Find Shows</SectionLabel>
        <div className={styles.keywordBar} style={{ marginTop: 10 }}>
          <SearchIcon size={14} style={{ opacity: 0.4 }} />
          <input
            className={styles.keywordInput}
            placeholder="Search by keyword…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <div className={styles.keywordClearBtn} onClick={() => setKeyword('')}>
              <X size={11} color="#6e6e73" />
            </div>
          )}
        </div>

        <div className={styles.categoryGrid} style={{ marginTop: 10 }}>
          {categories.map((c) => (
            <div
              key={c.label}
              className={styles.categoryChip}
              style={{
                background: c.bg,
                color: c.cl,
                outline:
                  activePicksSource?.type === 'category' && activePicksSource.value === c.label
                    ? `1.5px solid ${c.cl}`
                    : 'none'
              }}
              onClick={() => {
                setKeyword('')
                pickRecCategory(c.label)
              }}
            >
              {c.label}
            </div>
          ))}
        </div>
      </div>

      {activePicksSource && (
        <div>
          <div className={styles.pickHeader}>
            <SectionLabel>{picksTitle}</SectionLabel>
            <div className={styles.shuffleBtn} onClick={shuffleCategoryPicks} title="Show 3 different shows">
              <Shuffle size={12} /> Shuffle
            </div>
          </div>

          {categoryPicksLoading && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10 }}>
              Loading…
            </div>
          )}

          {!categoryPicksLoading && categoryPicks.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 10 }}>
              No shows found.
            </div>
          )}

          {!categoryPicksLoading && categoryPicks.length > 0 && (
            <div className={styles.pickList} style={{ marginTop: 10 }}>
              {categoryPicks.map((p) => {
                const subbed = subscribedFeedUrls.has(p.feedUrl)
                return (
                  <div className={styles.pickRow} key={p.id}>
                    <PodcastArtwork artworkUrl={p.artworkUrl} fallbackLabel={p.name} size={48} radius={10} />
                    <div className={styles.pickMeta}>
                      <div className={styles.pickName}>{p.name}</div>
                      <div className={styles.pickSub}>
                        {p.author}
                        {p.category ? ` · ${p.category}` : ''}
                      </div>
                    </div>
                    <Pill
                      variant={subbed ? 'secondary' : 'primary'}
                      onClick={() => !subbed && subscribe(p.feedUrl)}
                    >
                      {subbed ? 'Subscribed' : 'Subscribe'}
                    </Pill>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div>
        <SectionLabel>Trending Episodes (last 72h)</SectionLabel>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
          Recent episodes from the top-charting US shows in each category — not a measure of actual
          play counts, which no podcast directory makes public.
        </div>
        <div className={styles.categoryGrid} style={{ marginTop: 10 }}>
          {categories.map((c) => (
            <div
              key={c.label}
              className={styles.categoryChip}
              style={{
                background: c.bg,
                color: c.cl,
                outline: trendingCategory === c.label ? `1.5px solid ${c.cl}` : 'none'
              }}
              onClick={() => pickTrendingCategory(c.label)}
            >
              {c.label}
            </div>
          ))}
        </div>

        {trendingCategory && (
          <div style={{ marginTop: 10 }}>
            {trendingEpisodesLoading && (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>
            )}

            {!trendingEpisodesLoading && trendingEpisodes.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                No recent episodes found for {trendingCategory} in the last 72 hours.
              </div>
            )}

            {!trendingEpisodesLoading && trendingEpisodes.length > 0 && (
              <div className={styles.pickList}>
                {trendingEpisodes.map((ep) => {
                  const subbed = subscribedFeedUrls.has(ep.podcastFeedUrl)
                  return (
                    <div className={styles.pickRow} key={ep.id}>
                      <PodcastArtwork
                        artworkUrl={ep.artworkUrl ?? ep.podcastArtworkUrl}
                        fallbackLabel={ep.podcastName}
                        size={48}
                        radius={10}
                      />
                      <div className={styles.pickMeta}>
                        <div className={styles.pickName}>{ep.title}</div>
                        <div className={styles.pickSub}>
                          {ep.podcastName} · {timeAgoLabel(ep.pubDateIso)}
                          {ep.durationSec ? ` · ${formatDurationLabel(ep.durationSec)}` : ''}
                        </div>
                      </div>
                      <Pill
                        variant={subbed ? 'secondary' : 'primary'}
                        onClick={() => !subbed && subscribe(ep.podcastFeedUrl)}
                      >
                        {subbed ? 'Subscribed' : 'Subscribe'}
                      </Pill>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RecommendationsScreen
