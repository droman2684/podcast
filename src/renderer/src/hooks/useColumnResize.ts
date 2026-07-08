import { useEffect } from 'react'
import { useAppStore } from '@renderer/state/store'

export function useColumnResize(): void {
  const dragging = useAppStore((s) => s.dragging)

  useEffect(() => {
    if (!dragging) return

    const onMouseMove = (e: MouseEvent): void => {
      useAppStore.getState().updateResize(e.clientX)
    }
    const onMouseUp = (): void => {
      useAppStore.getState().endResize()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging])
}
