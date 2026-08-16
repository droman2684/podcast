import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { Library, Search, Sparkles, ListOrdered } from 'lucide-react-native'
import type { Episode, Podcast } from '@shared/types'
import { useStore } from '../state/store'
import Artwork from './Artwork'
import { colors, radii } from '../theme'
import type { LayoutMode } from '../lib/useLayout'
import type { Tab } from './TabBar'

export const SIDEBAR_WIDTH = 260
export const RAIL_WIDTH = 88

// Same destinations, same order, same icons as TabBar.tsx — rotating an
// iPad shouldn't rearrange the app.
const ITEMS: { key: Tab; label: string; Icon: typeof Library }[] = [
  { key: 'queue', label: 'Queue', Icon: ListOrdered },
  { key: 'library', label: 'Library', Icon: Library },
  { key: 'search', label: 'Search', Icon: Search },
  { key: 'discover', label: 'Discover', Icon: Sparkles }
]

const RECENT_LIMIT = 4

function formatRemaining(durationSec: number, positionSec: number): string {
  const left = Math.max(0, Math.round((durationSec - positionSec) / 60))
  return left > 0 ? `${left}m left` : 'Almost done'
}

interface Props {
  mode: LayoutMode
  active: Tab
  onSelect: (tab: Tab) => void
  onOpenSettings: () => void
  onOpenPlayer: (podcastId: string, episodeId: string) => void
}

// Replaces TabBar at `rail` and `regular` widths. Deliberately a drop-in for
// TabBar's props (active/onSelect) plus the two extra entry points the tab bar
// never had room for: app settings and continue-listening.
export default function Sidebar({
  mode,
  active,
  onSelect,
  onOpenSettings,
  onOpenPlayer
}: Props): React.JSX.Element {
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const positions = useStore((s) => s.positions)
  const queue = useStore((s) => s.queue)
  const userEmail = useStore((s) => s.userEmail)

  const isRail = mode === 'rail'

  const counts: Partial<Record<Tab, number>> = {
    library: podcasts.length,
    queue: queue.length
  }

  // Episodes with a saved position that aren't finished. The store has no
  // "last played at" timestamp, so this is ordered by publish date — newest
  // first.
  const inProgress = useMemo(() => {
    const out: { episode: Episode; podcast: Podcast }[] = []
    for (const podcast of podcasts) {
      for (const episode of episodesByPodcast[podcast.id] ?? []) {
        if (!episode.played && (positions[episode.id] ?? 0) > 0) out.push({ episode, podcast })
      }
    }
    out.sort((a, b) => (a.episode.pubDateIso < b.episode.pubDateIso ? 1 : -1))
    return out.slice(0, RECENT_LIMIT)
  }, [podcasts, episodesByPodcast, positions])

  const initials = (userEmail ?? '?').slice(0, 2).toUpperCase()

  return (
    <View style={[styles.bar, { width: isRail ? RAIL_WIDTH : SIDEBAR_WIDTH }]}>
      <View style={[styles.logo, isRail && styles.logoRail]}>
        <View style={styles.mark}>
          <Text style={styles.markText}>EP</Text>
        </View>
        {!isRail && <Text style={styles.wordmark}>Empire Pod</Text>}
      </View>

      <View style={styles.nav}>
        {ITEMS.map(({ key, label, Icon }) => {
          const on = active === key
          const count = counts[key]
          return (
            <Pressable
              key={key}
              style={[styles.item, isRail && styles.itemRail, on && styles.itemActive]}
              onPress={() => onSelect(key)}
            >
              <Icon size={21} color={on ? colors.accent : colors.navInactive} />
              <Text
                style={[
                  styles.label,
                  isRail && styles.labelRail,
                  on && { color: colors.accent }
                ]}
              >
                {label}
              </Text>
              {count !== undefined && count > 0 && (
                <View style={[styles.badge, isRail && styles.badgeRail, on && styles.badgeActive]}>
                  <Text style={[styles.badgeText, on && styles.badgeTextActive]}>{count}</Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>

      {!isRail && (
        <>
          <Text style={styles.sectionTitle}>Continue listening</Text>
          <ScrollView style={styles.recent} contentContainerStyle={{ gap: 2 }}>
            {inProgress.length === 0 ? (
              <Text style={styles.empty}>Nothing in progress.</Text>
            ) : (
              inProgress.map(({ episode, podcast }) => (
                <Pressable
                  key={episode.id}
                  style={styles.recentItem}
                  onPress={() => onOpenPlayer(podcast.id, episode.id)}
                >
                  <Artwork
                    url={podcast.customArtworkUrl ?? episode.artworkUrl ?? podcast.artworkUrl}
                    size={34}
                    radius={radii.artworkSm}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {podcast.name}
                    </Text>
                    <Text style={styles.recentMeta} numberOfLines={1}>
                      {formatRemaining(episode.durationSec, positions[episode.id] ?? 0)}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        </>
      )}

      {isRail && <View style={{ flex: 1 }} />}

      <View style={styles.footer}>
        <Pressable style={[styles.account, isRail && styles.accountRail]} onPress={onOpenSettings}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {!isRail && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {userEmail ?? 'Signed in'}
              </Text>
              <Text style={styles.accountHint}>Settings &amp; account</Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    paddingTop: 44,
    paddingBottom: 14,
    paddingHorizontal: 12
  },

  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 20 },
  logoRail: { justifyContent: 'center', paddingHorizontal: 0 },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  wordmark: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },

  nav: { gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: radii.item
  },
  // Icon over label, matching the tab bar's vertical stack so the rail reads
  // as the same control the phone user already knows.
  itemRail: { flexDirection: 'column', gap: 4, height: 62, justifyContent: 'center', paddingHorizontal: 0 },
  itemActive: { backgroundColor: colors.accentBg },
  label: { fontSize: 14.5, fontWeight: '600', color: colors.navInactive, flex: 1 },
  labelRail: { fontSize: 10.5, flex: 0 },

  badge: {
    backgroundColor: '#e8e8ed',
    borderRadius: radii.badge,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  badgeRail: { position: 'absolute', top: 6, right: 12, paddingHorizontal: 6 },
  badgeActive: { backgroundColor: colors.accent },
  badgeText: { fontSize: 11.5, fontWeight: '700', color: colors.textPlaceholder },
  badgeTextActive: { color: '#fff' },

  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textPlaceholder,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 9
  },
  recent: { flex: 1 },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.item
  },
  recentTitle: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  recentMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  empty: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 14 },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 10,
    paddingTop: 10
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.item
  },
  accountRail: { justifyContent: 'center', paddingHorizontal: 0 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  accountEmail: { fontSize: 12.5, fontWeight: '600', color: colors.textPrimary },
  accountHint: { fontSize: 10.5, color: colors.textMuted }
})
