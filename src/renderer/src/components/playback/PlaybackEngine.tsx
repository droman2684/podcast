import { useAudioEngine } from '@renderer/hooks/useAudioEngine'

function PlaybackEngine(): React.JSX.Element {
  const audioRef = useAudioEngine()
  return <audio ref={audioRef} style={{ display: 'none' }} />
}

export default PlaybackEngine
