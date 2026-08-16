import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
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
import TabBar, { type Tab } from './components/TabBar'

type Route =
  | { name: 'tabs' }
  | { name: 'episodes'; podcastId: string }
  | { name: 'player'; podcastId: string; episodeId: string }
  | { name: 'podcastSettings'; podcastId: string }

export default function App(): React.JSX.Element {
  const authLoading = useStore((s) => s.authLoading)
  const signedIn = useStore((s) => s.signedIn)
  const initAuth = useStore((s) => s.initAuth)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)
  const libraryLoaded = useStore((s) => s.libraryLoaded)
  const loadLibrary = useStore((s) => s.loadLibrary)

  const [tab, setTab] = useState<Tab>('library')
  const [route, setRoute] = useState<Route>({ name: 'tabs' })

  useEffect(() => {
    initAuth()
  }, [initAuth])

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
  const goToPlayer = (podcastId: string, episodeId: string): void =>
    setRoute({ name: 'player', podcastId, episodeId })

  const handleAdvance = (episodeId: string): void => {
    for (const podcast of podcasts) {
      if (episodesByPodcast[podcast.id]?.some((e) => e.id === episodeId)) {
        goToPlayer(podcast.id, episodeId)
        return
      }
    }
    goToTabs()
  }

  let screen: React.JSX.Element
  let showTabBar = false

  if (route.name === 'tabs') {
    showTabBar = true
    if (tab === 'library') {
      screen = (
        <LibraryScreen
          onSelectPodcast={goToEpisodes}
          onOpenSettings={(podcastId) => setRoute({ name: 'podcastSettings', podcastId })}
        />
      )
    } else if (tab === 'search') {
      screen = <SearchScreen />
    } else if (tab === 'discover') {
      screen = <DiscoverScreen />
    } else {
      screen = <QueueScreen onPlay={goToPlayer} />
    }
  } else if (route.name === 'episodes') {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    screen = podcast ? (
      <EpisodeListScreen
        podcast={podcast}
        onBack={goToTabs}
        onPlay={(episodeId) => goToPlayer(podcast.id, episodeId)}
        onOpenSettings={(podcastId) => setRoute({ name: 'podcastSettings', podcastId })}
      />
    ) : (
      <LibraryScreen
        onSelectPodcast={goToEpisodes}
        onOpenSettings={(podcastId) => setRoute({ name: 'podcastSettings', podcastId })}
      />
    )
  } else if (route.name === 'podcastSettings') {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    screen = podcast ? (
      <PodcastSettingsScreen podcast={podcast} onBack={goToTabs} onUnsubscribed={goToTabs} />
    ) : (
      <LibraryScreen
        onSelectPodcast={goToEpisodes}
        onOpenSettings={(podcastId) => setRoute({ name: 'podcastSettings', podcastId })}
      />
    )
  } else {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    const episode = episodesByPodcast[route.podcastId]?.find((e) => e.id === route.episodeId)
    screen =
      podcast && episode ? (
        <PlayerScreen
          episode={episode}
          podcast={podcast}
          onBack={() => goToEpisodes(podcast.id)}
          onAdvance={handleAdvance}
        />
      ) : (
        <LibraryScreen
          onSelectPodcast={goToEpisodes}
          onOpenSettings={(podcastId) => setRoute({ name: 'podcastSettings', podcastId })}
        />
      )
  }

  return (
    <>
      <View style={{ flex: 1 }}>{screen}</View>
      {showTabBar && <TabBar active={tab} onSelect={setTab} />}
      <StatusBar style="auto" />
    </>
  )
}
