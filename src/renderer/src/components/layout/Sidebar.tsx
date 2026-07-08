import { useState } from 'react'
import { Home, Search, ListOrdered, Radio, Lock, X, Copy, Check } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import PodcastArtwork from '@renderer/components/ui/PodcastArtwork'
import SidebarNavItem from './SidebarNavItem'
import type { Podcast } from '@renderer/types'
import styles from './Sidebar.module.css'

function buildSubscriptionExport(podcasts: Podcast[]): string {
  const lines = podcasts.map((p) => {
    const bits = [p.name]
    if (p.author) bits.push(p.author)
    if (p.category) bits.push(p.category)
    return `- ${bits.join(' — ')}`
  })
  return `My podcast subscriptions (${podcasts.length}):\n${lines.join('\n')}\n\nCan you recommend similar podcasts I might like?`
}

// Library and Episodes screens are still reachable (clicking a subscription
// below jumps straight to its Episodes screen) — just not shown as their own
// top-level links since the Subscriptions list already covers that ground.
const browseItems = [
  { nav: 'home' as const, label: 'Home', icon: Home },
  { nav: 'search' as const, label: 'Search', icon: Search },
  { nav: 'queue' as const, label: 'Queue', icon: ListOrdered }
]

const manageItems = [
  { nav: 'stations' as const, label: 'Stations', icon: Radio },
  { nav: 'feeds' as const, label: 'Private Feeds', icon: Lock }
]

function Sidebar(): React.JSX.Element {
  const sidebarW = useAppStore((s) => s.sidebarW)
  const nav = useAppStore((s) => s.nav)
  const goTo = useAppStore((s) => s.goTo)

  const podcasts = useAppStore((s) => s.podcasts)
  const unsubscribe = useAppStore((s) => s.unsubscribe)

  const [copied, setCopied] = useState(false)

  const handleExport = async (): Promise<void> => {
    await navigator.clipboard.writeText(buildSubscriptionExport(podcasts))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.sidebar} style={{ width: sidebarW }}>
      <div className={styles.logoRow}>
        <div className={styles.logoMark}>
          <svg width="26" height="26" viewBox="0 0 1024 1024">
            <text
              x="512"
              y="600"
              fontFamily="Helvetica, Arial, sans-serif"
              fontSize="300"
              fontWeight="800"
              fill="white"
              textAnchor="middle"
              letterSpacing="6"
            >
              POD
            </text>
            <rect x="337" y="660" width="350" height="26" rx="13" fill="#FF5910" />
          </svg>
        </div>
        <span className={styles.wordmark}>Empire Pod</span>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Browse</div>
        <div className={styles.navList}>
          {browseItems.map((item) => (
            <SidebarNavItem
              key={item.nav}
              icon={item.icon}
              label={item.label}
              active={nav === item.nav}
              onClick={() => goTo(item.nav)}
            />
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Manage</div>
        <div className={styles.navList}>
          {manageItems.map((item) => (
            <SidebarNavItem
              key={item.nav}
              icon={item.icon}
              label={item.label}
              active={nav === item.nav}
              onClick={() => goTo(item.nav)}
            />
          ))}
        </div>
      </div>

      <div className={styles.section} style={{ flexShrink: 0, paddingBottom: 4 }}>
        <div className={styles.subscriptionsHeader}>
          <div className={styles.sectionLabel}>Subscriptions</div>
          {podcasts.length > 0 && (
            <div
              className={styles.exportBtn}
              onClick={handleExport}
              title="Copy subscription list to clipboard — paste it to Claude for recommendations"
            >
              {copied ? <Check size={12} color="var(--color-accent)" /> : <Copy size={12} color="#8e8e93" />}
            </div>
          )}
        </div>
      </div>
      <div className={styles.subscriptions}>
        {podcasts.map((p) => (
          <div key={p.id} className={styles.subRow} onClick={() => goTo('episode', p.id)}>
            <PodcastArtwork
              artworkUrl={p.customArtworkUrl ?? p.artworkUrl}
              fallbackLabel={p.name}
              size={26}
              radius={7}
            />
            <span className={styles.subName}>{p.name}</span>
            {p.unread > 0 && <span className={styles.subBadge}>{p.unread}</span>}
            <div
              className={styles.unsubBtn}
              onClick={(e) => {
                e.stopPropagation()
                unsubscribe(p.id)
              }}
              title={`Unsubscribe from ${p.name}`}
            >
              <X size={12} color="#8e8e93" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Sidebar
