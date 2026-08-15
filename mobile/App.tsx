import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useStore } from './state/store'
import SignInScreen from './screens/SignInScreen'
import LibraryScreen from './screens/LibraryScreen'
import EpisodeListScreen from './screens/EpisodeListScreen'
import PlayerScreen from './screens/PlayerScreen'

type Route =
  | { name: 'library' }
  | { name: 'episodes'; podcastId: string }
  | { name: 'player'; podcastId: string; episodeId: string }

export default function App(): React.JSX.Element {
  const authLoading = useStore((s) => s.authLoading)
  const signedIn = useStore((s) => s.signedIn)
  const initAuth = useStore((s) => s.initAuth)
  const podcasts = useStore((s) => s.podcasts)
  const episodesByPodcast = useStore((s) => s.episodesByPodcast)

  const [route, setRoute] = useState<Route>({ name: 'library' })

  useEffect(() => {
    initAuth()
  }, [initAuth])

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

  let screen: React.JSX.Element
  if (route.name === 'library') {
    screen = (
      <LibraryScreen
        onSelectPodcast={(podcastId) => setRoute({ name: 'episodes', podcastId })}
        onSignOut={() => setRoute({ name: 'library' })}
      />
    )
  } else if (route.name === 'episodes') {
    const podcast = podcasts.find((p) => p.id === route.podcastId)
    screen = podcast ? (
      <EpisodeListScreen
        podcast={podcast}
        onBack={() => setRoute({ name: 'library' })}
        onPlay={(episodeId) => setRoute({ name: 'player', podcastId: podcast.id, episodeId })}
      />
    ) : (
      <LibraryScreen
        onSelectPodcast={(podcastId) => setRoute({ name: 'episodes', podcastId })}
        onSignOut={() => setRoute({ name: 'library' })}
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
          onBack={() => setRoute({ name: 'episodes', podcastId: podcast.id })}
        />
      ) : (
        <LibraryScreen
          onSelectPodcast={(podcastId) => setRoute({ name: 'episodes', podcastId })}
          onSignOut={() => setRoute({ name: 'library' })}
        />
      )
  }

  return (
    <>
      {screen}
      <StatusBar style="auto" />
    </>
  )
}
