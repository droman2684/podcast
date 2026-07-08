import type { ResizeTarget } from '@renderer/types'
import { useAppStore } from '@renderer/state/store'
import styles from './ResizeHandle.module.css'

interface ResizeHandleProps {
  target: ResizeTarget
}

function ResizeHandle({ target }: ResizeHandleProps): React.JSX.Element {
  const beginResize = useAppStore((s) => s.beginResize)

  return (
    <div
      className={styles.handle}
      onMouseDown={(e) => beginResize(target, e.clientX)}
      role="separator"
      aria-orientation="vertical"
    />
  )
}

export default ResizeHandle
