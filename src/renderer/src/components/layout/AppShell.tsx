import { useAppStore } from '@renderer/state/store'
import { useColumnResize } from '@renderer/hooks/useColumnResize'
import Sidebar from './Sidebar'
import ResizeHandle from './ResizeHandle'
import MainContent from './MainContent'
import NowPlayingPanel from './NowPlayingPanel'
import BottomPlayerBar from './BottomPlayerBar'
import PodcastSettingsModal from '@renderer/components/modals/PodcastSettingsModal'
import PlaybackEngine from '@renderer/components/playback/PlaybackEngine'
import NowPlayingExpanded from '@renderer/components/playback/NowPlayingExpanded'
import styles from './AppShell.module.css'

function AppShell(): React.JSX.Element {
  useColumnResize()
  const dragging = useAppStore((s) => s.dragging)

  return (
    <div className={`${styles.root} ${dragging ? styles.dragging : ''}`}>
      <div className={styles.body}>
        <Sidebar />
        <ResizeHandle target="sidebar" />
        <MainContent />
        <ResizeHandle target="panel" />
        <NowPlayingPanel />
      </div>
      <BottomPlayerBar />
      <PodcastSettingsModal />
      <PlaybackEngine />
      <NowPlayingExpanded />
    </div>
  )
}

export default AppShell
