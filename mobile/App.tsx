import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useStore } from './state/store'
import { buildEpisodeIndex } from './lib/episodeIndex'
import SignInScreen from './screens/SignInScreen'
import LibraryScreen from './screens/LibraryScreen'
import EpisodeListScreen from './screens/EpisodeListScreen'
import PlayerScreen from './screens/PlayerScreen'
import PodcastSettingsScreen from './screens/PodcastSettingsScreen'
import DiscoverScreen from './screens/DiscoverScreen'
import QueueScreen from './screens/QueueScreen'
import SettingsScreen from './screens/SettingsScreen'
import CategoriesScreen from './screens/CategoriesScreen'
import CategoryDetailScreen from './screens/CategoryDetailScreen'
import PrivateFeedScreen from './screens/PrivateFeedScreen'
import TabBar, { type Tab } from './components/TabBar'
import Sidebar from './components/Sidebar'
import AudioEngine from './components/AudioEngine'
import MiniPlayer from './components/MiniPlayer'
import { useLayout } from './lib/useLayout'
import { colors } from './theme'

type Route =
  | { name: 'tabs' }
  | { name: 'episodes'; podcastId: string }
  | { name: 'player'; podcastId: string; episodeId: string }
  | { name: 'podcastSettings'; podcastId: string }
  | { name: 'settings' }
  | { name: 'categories' }
  | { name: 'categoryDetail'; stationId: string }
  | { name: 'privateFeed'; retryFeedId?: string }

export default function App(): React.JSX.Element {
  const authLoading = useStore((s) => s.authLoading)
  const authError = useStore((s) => s.authError)
  const signedIn = useStore((s) => s.signedIn)
  const initAuth = useStore((s) => s.initAuth)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadCachedPositions = useStore((s) => s.loadCachedPositions)
  const loadDownloads = useStore((s) => s.loadDownloads)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const libraryLoaded = useStore((s) => s.libraryLoaded)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const stations = useStore((s) => s.stations)
  const stationsLoaded = useStore((s) => s.stationsLoaded)
  const loadStations = useStore((s) => s.loadStations)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const playing = useStore((s) => s.playing)
  const togglePlay = useStore((s) => s.togglePlay)
  const loadEpisode = useStore((s) => s.loadEpisode)

  const [tab, setTab] = useState<Tab>('queue')
  const [route, setRoute] = useState<Route>({ name: 'tabs' })
  // Wherever the Player was opened FROM, so its back button returns there
  // instead of always assuming "the show's episode list" — e.g. opened from
  // the Queue, back should return to the Queue, not the show page.
  const cameFromRef = useRef<Route>({ name: 'tabs' })

  // Drives the whole iPad adaptation. Called unconditionally, above the
  // authLoading/signedIn early returns, so hook order stays stable.
  const { mode, isTablet } = useLayout()
  // Used to resolve the Player screen's episode from the live
  // currentEpisodeId rather than the route's (possibly stale) episodeId —
  // see the player branch below. Same unconditional-hooks reasoning as
  // useLayout above.
  const episodeIndex = useMemo(() => buildEpisodeIndex(episodesByPodcast), [episodesByPodcast])

  useEffect(() => {
    initAuth()
    // Device-local prefs (skip durations, default library view), the
    // locally-cached playback positions, and the downloaded-episode file
    // listing — none of these are tied to a user account, so all three load
    // regardless of sign-in state.
    loadSettings()
    loadCachedPositions()
    loadDownloads()
  }, [initAuth, loadSettings, loadCachedPositions, loadDownloads])

  // Loads once per sign-in, not once per Library-tab visit — LibraryScreen
  // itself only re-fetches on an explicit pull-to-refresh.
  useEffect(() => {
    if (signedIn && !libraryLoaded) loadLibrary()
  }, [signedIn, libraryLoaded, loadLibrary])

  useEffect(() => {
    if (signedIn && !stationsLoaded) loadStations()
  }, [signedIn, stationsLoaded, loadStations])

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: 13 }}>Loading…</Text>
        <StatusBar style="auto" />
      </View>
    )
  }

  if (!signedIn) {
    return (
      <>
        {authError && (
          <View style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8, backgroundColor: colors.dangerBg }}>
            <Text style={{ color: colors.danger, fontSize: 12 }}>{authError}</Text>
          </View>
        )}
        <SignInScreen />
        <StatusBar style="auto" />
      </>
    )
  }

  const goToTabs = (): void => setRoute({ name: 'tabs' })
  const goToEpisodes = (podcastId: string): void => setRoute({ name: 'episodes', podcastId })
  const openSettings = (podcastId: string): void => setRoute({ name: 'podcastSettings', podcastId })
  const goToAppSettings = (): void => setRoute({ name: 'settings' })
  const goToCategories = (): void => setRoute({ name: 'categories' })
  const goToCategoryDetail = (stationId: string): void => setRoute({ name: 'categoryDetail', stationId })
  const goToAddPrivateFeed = (): void => setRoute({ name: 'privateFeed' })
  const goToRetryPrivateFeed = (retryFeedId: string): void => setRoute({ name: 'privateFeed', retryFeedId })

  // Opens the Player screen for an episode. Only (re)loads it into the
  // global engine if it isn't already the current one — re-opening the
  // player for what's already playing shouldn't reset its position/state.
  // Captures the route being left so the Player's back button can return to
  // it (see cameFromRef above).
  const openPlayer = (podcastId: string, episodeId: string, autoplay = false): void => {
    if (currentEpisodeId !== episodeId) {
      loadEpisode(episodeId, { autoplay })
    } else if (autoplay && !playing) {
      togglePlay()
    }
    cameFromRef.current = route
    setRoute({ name: 'player', podcastId, episodeId })
  }

  const goBackFromPlayer = (): void => setRoute(cameFromRef.current)

  // At tablet widths the sidebar is persistent, so picking a destination has to
  // also unwind any drill-in the content area is currently showing — otherwise
  // tapping "Library" while on the Player screen would appear to do nothing.
  // Defined up here (not just before the tablet/phone return blocks) since
  // Queue's empty state also uses it to jump straight to Library/Discover.
  const selectTab = (next: Tab): void => {
    setTab(next)
    setRoute({ name: 'tabs' })
  }

  let screen: React.JSX.Element
  let showTabBar = false

  if (route.name === 'tabs') {
    showTabBar = true
    if (tab === 'library') {
      screen = (
        <LibraryScreen
          onSelectPodcast={goToEpisodes}
          onOpenSettings={openSettings}
          onOpenAppSettings={goToAppSettings}
          onManageCategories={goToCategories}
        onRetryPrivateFeed={goToRetryPrivateFeed}
        />
      )
    } else if (tab === 'discover') {
      screen = <DiscoverScreen onOpenAppSettings={goToAppSettings} onAddPrivateFeed={goToAddPrivateFeed} />
    } else {
      screen = (
        <QueueScreen
          onPlay={openPlayer}
          onBrowseLibrary={() => selectTab('library')}
          onBrowseDiscover={() => selectTab('discover')}
          onOpenAppSettings={goToAppSettings}
        />
      )
    }
  } else if (route.name === 'episodes') {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    screen = podcast ? (
      <EpisodeListScreen
        podcast={podcast}
        onBack={goToTabs}
        onPlay={(episodeId) => openPlayer(podcast.id, episodeId)}
        onOpenSettings={openSettings}
      />
    ) : (
      <LibraryScreen
        onSelectPodcast={goToEpisodes}
        onOpenSettings={openSettings}
        onOpenAppSettings={goToAppSettings}
        onManageCategories={goToCategories}
        onRetryPrivateFeed={goToRetryPrivateFeed}
      />
    )
  } else if (route.name === 'podcastSettings') {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    screen = podcast ? (
      <PodcastSettingsScreen podcast={podcast} onBack={goToTabs} onUnsubscribed={goToTabs} />
    ) : (
      <LibraryScreen
        onSelectPodcast={goToEpisodes}
        onOpenSettings={openSettings}
        onOpenAppSettings={goToAppSettings}
        onManageCategories={goToCategories}
        onRetryPrivateFeed={goToRetryPrivateFeed}
      />
    )
  } else if (route.name === 'settings') {
    screen = <SettingsScreen onBack={goToTabs} />
  } else if (route.name === 'categories') {
    screen = <CategoriesScreen onBack={goToTabs} onOpenCategory={goToCategoryDetail} />
  } else if (route.name === 'categoryDetail') {
    const station = stations.find((s) => s.id === route.stationId)
    screen = station ? (
      <CategoryDetailScreen station={station} onBack={goToCategories} onDeleted={goToCategories} />
    ) : (
      <CategoriesScreen onBack={goToTabs} onOpenCategory={goToCategoryDetail} />
    )
  } else if (route.name === 'privateFeed') {
    screen = <PrivateFeedScreen onBack={goToTabs} retryFeedId={route.retryFeedId} />
  } else {
    // Resolves from the live currentEpisodeId rather than the route's own
    // episodeId — the route params only reflect what was true at the
    // moment Player was opened. Once the queue auto-advances (AudioEngine's
    // finish handler calls loadEpisode() directly, without going through
    // this component's navigation), currentEpisodeId is what's actually
    // playing; falling back to route.episodeId only covers the moment
    // before that first assignment.
    const activeEpisodeId = currentEpisodeId ?? route.episodeId
    const episode = episodeIndex.get(activeEpisodeId)
    const podcast = episode
      ? podcasts.find((p) => p.id === episode.podcastId)
      : podcasts.find((p) => p.id === route.podcastId)
    screen =
      podcast && episode ? (
        <PlayerScreen episode={episode} podcast={podcast} onBack={goBackFromPlayer} />
      ) : (
        <LibraryScreen
          onSelectPodcast={goToEpisodes}
          onOpenSettings={openSettings}
          onOpenAppSettings={goToAppSettings}
          onManageCategories={goToCategories}
        onRetryPrivateFeed={goToRetryPrivateFeed}
        />
      )
  }

  // Hidden on the Player screen itself (route.name === 'player') — showing a
  // mini bar for the same episode you're already looking at full-screen
  // would be redundant clutter, not a shortcut.
  const showMiniPlayer = currentEpisodeId !== null && route.name !== 'player'

  if (isTablet) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
        <AudioEngine />
        <Sidebar
          mode={mode}
          active={tab}
          onSelect={selectTab}
          onOpenSettings={goToAppSettings}
          onOpenPlayer={openPlayer}
          currentEpisodeId={currentEpisodeId}
        />
        {/* Drill-in still pushes within this column for now; the list/detail
            split lands with SplitView (spec §3). */}
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>{screen}</View>
          {showMiniPlayer && <MiniPlayer onOpen={openPlayer} />}
        </View>
        <StatusBar style="auto" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <AudioEngine />
      <View style={{ flex: 1 }}>{screen}</View>
      {showMiniPlayer && <MiniPlayer onOpen={openPlayer} />}
      {showTabBar && <TabBar active={tab} onSelect={setTab} />}
      <StatusBar style="auto" />
    </View>
  )
}
