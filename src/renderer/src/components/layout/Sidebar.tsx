import { useEffect, useRef, useState } from 'react'
import {
  Home,
  Search,
  ListOrdered,
  Radio,
  Lock,
  X,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  Download,
  Upload,
  Cloud
} from 'lucide-react'
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
  { nav: 'queue' as const, label: 'Queue', icon: ListOrdered },
  { nav: 'recommendations' as const, label: 'Recommendations', icon: Sparkles }
]

const manageItems = [
  { nav: 'stations' as const, label: 'Stations', icon: Radio },
  { nav: 'feeds' as const, label: 'Private Feeds', icon: Lock }
]

type UpdateState = 'idle' | 'checking' | 'upToDate' | 'available' | 'installing' | 'error'

function Sidebar(): React.JSX.Element {
  const sidebarW = useAppStore((s) => s.sidebarW)
  const nav = useAppStore((s) => s.nav)
  const goTo = useAppStore((s) => s.goTo)

  const podcasts = useAppStore((s) => s.podcasts)
  const unsubscribe = useAppStore((s) => s.unsubscribe)
  const importOpml = useAppStore((s) => s.importOpml)
  const syncStatus = useAppStore((s) => s.syncStatus)
  const lastSyncNewCount = useAppStore((s) => s.lastSyncNewCount)
  const authStep = useAppStore((s) => s.authStep)
  const openAccountModal = useAppStore((s) => s.openAccountModal)

  const [copied, setCopied] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)

  // Mirrors the YouTube app's bottom-left sync indicator: show it while a
  // feed refresh is in flight, then briefly confirm before fading out —
  // rather than just disappearing the instant syncing flips back to idle.
  const [showSynced, setShowSynced] = useState(false)
  const wasSyncingRef = useRef(false)
  useEffect(() => {
    if (syncStatus === 'syncing') {
      wasSyncingRef.current = true
      setShowSynced(false)
      return
    }
    if (!wasSyncingRef.current) return
    wasSyncingRef.current = false
    setShowSynced(true)
    const timer = setTimeout(() => setShowSynced(false), 2500)
    return () => clearTimeout(timer)
  }, [syncStatus])

  const handleExport = async (): Promise<void> => {
    await navigator.clipboard.writeText(buildSubscriptionExport(podcasts))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // OPML is the export format Overcast (and Apple Podcasts, Pocket Casts, etc.)
  // use for subscription lists — this lets users bring an existing library
  // over instead of re-adding every show by hand.
  const handleImportOpml = async (): Promise<void> => {
    if (importing) return
    setImporting(true)
    setImportSummary(null)
    try {
      const result = await importOpml()
      if (result) {
        const parts = [`${result.imported.length} imported`]
        if (result.skipped > 0) parts.push(`${result.skipped} already subscribed`)
        if (result.failed.length > 0) parts.push(`${result.failed.length} failed`)
        setImportSummary(parts.join(', '))
        setTimeout(() => setImportSummary(null), 4000)
      }
    } catch {
      setImportSummary('Import failed')
      setTimeout(() => setImportSummary(null), 4000)
    } finally {
      setImporting(false)
    }
  }

  const handleUpdateClick = async (): Promise<void> => {
    if (updateState === 'checking' || updateState === 'installing') return

    if (updateState === 'available') {
      setUpdateState('installing')
      try {
        await window.api.update.install()
      } catch {
        setUpdateState('error')
        setTimeout(() => setUpdateState('idle'), 2500)
      }
      return
    }

    setUpdateState('checking')
    try {
      const { available } = await window.api.update.check()
      setUpdateState(available ? 'available' : 'upToDate')
      if (!available) setTimeout(() => setUpdateState('idle'), 2500)
    } catch {
      setUpdateState('error')
      setTimeout(() => setUpdateState('idle'), 2500)
    }
  }

  const updateTitle: Record<UpdateState, string> = {
    idle: 'Check for updates',
    checking: 'Checking for updates…',
    upToDate: "You're up to date",
    available: 'Update available — click to install and restart',
    installing: 'Installing update…',
    error: 'Update check failed — click to retry'
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
        <div
          className={styles.updateBtn}
          onClick={openAccountModal}
          title={authStep === 'signedIn' ? 'Sync account' : 'Sign in to sync across devices'}
        >
          <Cloud size={13} color={authStep === 'signedIn' ? 'var(--color-accent)' : '#8e8e93'} />
        </div>
        <div
          className={`${styles.updateBtn} ${updateState === 'available' ? styles.updateBtnAvailable : ''}`}
          onClick={handleUpdateClick}
          title={updateTitle[updateState]}
        >
          {updateState === 'available' ? (
            <Download size={13} color="var(--color-accent)" />
          ) : updateState === 'upToDate' ? (
            <Check size={13} color="var(--color-accent)" />
          ) : (
            <RefreshCw
              size={13}
              color="#8e8e93"
              className={
                updateState === 'checking' || updateState === 'installing' ? styles.updateSpin : undefined
              }
            />
          )}
        </div>
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
          <div style={{ display: 'flex', gap: 4 }}>
            <div
              className={styles.exportBtn}
              onClick={handleImportOpml}
              title="Import an OPML file (e.g. exported from Overcast → Settings → Export OPML)"
            >
              <Upload size={12} color="#8e8e93" className={importing ? styles.updateSpin : undefined} />
            </div>
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
        {importSummary && <div className={styles.importSummary}>{importSummary}</div>}
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
      {(syncStatus === 'syncing' || showSynced) && (
        <div className={styles.syncStatus}>
          {syncStatus === 'syncing' ? (
            <>
              <RefreshCw size={12} color="#8e8e93" className={styles.updateSpin} />
              <span>Syncing…</span>
            </>
          ) : (
            <>
              <Check size={12} color="var(--color-accent)" />
              <span>
                {lastSyncNewCount > 0
                  ? `${lastSyncNewCount} new episode${lastSyncNewCount === 1 ? '' : 's'}`
                  : 'Up to date'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Sidebar
