import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useStore } from './state/store'
import SignInScreen from './screens/SignInScreen'
import HomeScreen from './screens/HomeScreen'
import LibraryScreen from './screens/LibraryScreen'
import EpisodeListScreen from './screens/EpisodeListScreen'
import PlayerScreen from './screens/PlayerScreen'
import PodcastSettingsScreen from './screens/PodcastSettingsScreen'
import SearchScreen from './screens/SearchScreen'
import DiscoverScreen from './screens/DiscoverScreen'
import QueueScreen from './screens/QueueScreen'
import SettingsScreen from './screens/SettingsScreen'
import TabBar, { type Tab } from './components/TabBar'
import AudioEngine from './components/AudioEngine'

type Route =
  | { name: 'tabs' }
  | { name: 'episodes'; podcastId: string }
  | { name: 'player'; podcastId: string; episodeId: string }
  | { name: 'podcastSettings'; podcastId: string }
  | { name: 'settings' }

export default function App(): React.JSX.Element {
  const authLoading = useStore((s) => s.authLoading)
  const signedIn = useStore((s) => s.signedIn)
  const initAuth = useStore((s) => s.initAuth)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadDownloads = useStore((s) => s.loadDownloads)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const libraryLoaded = useStore((s) => s.libraryLoaded)
  const loadLibrary = useStore((s) => s.loadLibrary)
  const currentEpisodeId = useStore((s) => s.currentEpisodeId)
  const loadEpisode = useStore((s) => s.loadEpisode)

  const [tab, setTab] = useState<Tab>('home')
  const [route, setRoute] = useState<Route>({ name: 'tabs' })

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

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <StatusBar style="auto" />
      </View>
    )
  }

  if (!signedIn) {
    return (
      <>
        <SignInScreen />
        <StatusBar style="auto" />
      </>
    )
  }

  const goToTabs = (): void => setRoute({ name: 'tabs' })
  const goToEpisodes = (podcastId: string): void => setRoute({ name: 'episodes', podcastId })
  const openSettings = (podcastId: string): void => setRoute({ name: 'podcastSettings', podcastId })
  const goToAppSettings = (): void => setRoute({ name: 'settings' })

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
    if (tab === 'home') {
      screen = <HomeScreen onOpenPlayer={openPlayer} onOpenSettings={goToAppSettings} />
    } else if (tab === 'library') {
      screen = <LibraryScreen onSelectPodcast={goToEpisodes} onOpenSettings={openSettings} />
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
      <LibraryScreen onSelectPodcast={goToEpisodes} onOpenSettings={openSettings} />
    )
  } else if (route.name === 'podcastSettings') {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    screen = podcast ? (
      <PodcastSettingsScreen podcast={podcast} onBack={goToTabs} onUnsubscribed={goToTabs} />
    ) : (
      <LibraryScreen onSelectPodcast={goToEpisodes} onOpenSettings={openSettings} />
    )
  } else if (route.name === 'settings') {
    screen = <SettingsScreen onBack={goToTabs} />
  } else {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    const episode = episodesByPodcast[route.podcastId]?.find((e) => e.id === route.episodeId)
    screen =
      podcast && episode ? (
        <PlayerScreen episode={episode} podcast={podcast} onBack={() => goToEpisodes(podcast.id)} />
      ) : (
        <LibraryScreen onSelectPodcast={goToEpisodes} onOpenSettings={openSettings} />
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
