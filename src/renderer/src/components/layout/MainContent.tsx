import { useAppStore } from '@renderer/state/store'
import HomeScreen from '@renderer/components/screens/HomeScreen'
import SearchScreen from '@renderer/components/screens/SearchScreen'
import LibraryScreen from '@renderer/components/screens/LibraryScreen'
import EpisodeScreen from '@renderer/components/screens/EpisodeScreen'
import QueueScreen from '@renderer/components/screens/QueueScreen'
import StationsScreen from '@renderer/components/screens/StationsScreen'
import FeedsScreen from '@renderer/components/screens/FeedsScreen'

function MainContent(): React.JSX.Element {
  const nav = useAppStore((s) => s.nav)
  const mainContentW = useAppStore((s) => s.mainContentW)

  const screen = (() => {
    switch (nav) {
      case 'home':
        return <HomeScreen />
      case 'search':
        return <SearchScreen />
      case 'library':
        return <LibraryScreen />
      case 'episode':
        return <EpisodeScreen />
      case 'queue':
        return <QueueScreen />
      case 'stations':
        return <StationsScreen />
      case 'feeds':
        return <FeedsScreen />
    }
  })()

  return (
    <div
      style={{
        width: mainContentW,
        flexShrink: 0,
        overflowY: 'auto',
        background: 'var(--color-bg)'
      }}
    >
      {screen}
    </div>
  )
}

export default MainContent
