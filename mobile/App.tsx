import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useStore } from './state/store'
import SignInScreen from './screens/SignInScreen'
import LibraryScreen from './screens/LibraryScreen'
import EpisodeListScreen from './screens/EpisodeListScreen'
import PlayerScreen from './screens/PlayerScreen'
import PodcastSettingsScreen from './screens/PodcastSettingsScreen'
import SearchScreen from './screens/SearchScreen'
import DiscoverScreen from './screens/DiscoverScreen'
import QueueScreen from './screens/QueueScreen'
import SettingsScreen from './screens/SettingsScreen'
import CategoriesScreen from './screens/CategoriesScreen'
import CategoryDetailScreen from './screens/CategoryDetailScreen'
import TabBar, { type Tab } from './components/TabBar'
import Sidebar from './components/Sidebar'
import AudioEngine from './components/AudioEngine'
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

export default function App(): React.JSX.Element {
  const authLoading = useStore((s) => s.authLoading)
  const authError = useStore((s) => s.authError)
  const signedIn = useStore((s) => s.signedIn)
  const initAuth = useStore((s) => s.initAuth)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadDownloads = useStore((s) => s.loadDownloads)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const libraryLoaded = useStore((s) => s.libraryLoaded)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const stations = useStore((s) => s.stations)
  const stationsLoaded = useStore((s) => s.stationsLoaded)
  const loadStations = useStore((s) => s.loadStations)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const loadEpisode = useStore((s) => s.loadEpisode)

  const [tab, setTab] = useState<Tab>('queue')
  const [route, setRoute] = useState<Route>({ name: 'tabs' })

  // Drives the whole iPad adaptation. Called unconditionally, above the
  // authLoading/signedIn early returns, so hook order stays stable.
  const { mode, isTablet } = useLayout()

  useEffect(() => {
    initAuth()
    // Device-local prefs (skip durations, default library view) and the
    // downloaded-episode file listing — neither tied to a user account, so
    // both load regardless of sign-in state.
    loadSettings()
    loadDownloads()
  }, [initAuth, loadSettings, loadDownloads])

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

  // Opens the Player screen for an episode. Only (re)loads it into the
  // global engine if it isn't already the current one — re-opening the
  // player for what's already playing shouldn't reset its position/state.
  const openPlayer = (podcastId: string, episodeId: string): void => {
    if (currentEpisodeId !== episodeId) loadEpisode(episodeId, { autoplay: false })
    setRoute({ name: 'player', podcastId, episodeId })
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
        />
      )
    } else if (tab === 'search') {
      screen = <SearchScreen />
    } else if (tab === 'discover') {
      screen = <DiscoverScreen />
    } else {
      screen = <QueueScreen onPlay={openPlayer} />
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
  } else {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    const episode = episodesByPodcast[route.podcastId]?.find((e) => e.id === route.episodeId)
    screen =
      podcast && episode ? (
        <PlayerScreen episode={episode} podcast={podcast} onBack={() => goToEpisodes(podcast.id)} />
      ) : (
        <LibraryScreen
        onSelectPodcast={goToEpisodes}
        onOpenSettings={openSettings}
        onOpenAppSettings={goToAppSettings}
        onManageCategories={goToCategories}
      />
      )
  }

  // At tablet widths the sidebar is persistent, so picking a destination has to
  // also unwind any drill-in the content area is currently showing — otherwise
  // tapping "Library" while on the Player screen would appear to do nothing.
  const selectTab = (next: Tab): void => {
    setTab(next)
    setRoute({ name: 'tabs' })
  }

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
        />
        {/* Drill-in still pushes within this column for now; the list/detail
            split lands with SplitView (spec §3). */}
        <View style={{ flex: 1 }}>{screen}</View>
        <StatusBar style="auto" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <AudioEngine />
      <View style={{ flex: 1 }}>{screen}</View>
      {showTabBar && <TabBar active={tab} onSelect={setTab} />}
      <StatusBar style="auto" />
    </View>
  )
}
