import { useEffect, useRef, useState } from 'react'
import { Animated, PanResponder, View, StyleSheet, type PanResponderInstance } from 'react-native'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

interface Props<T> {
  data: T[]
  keyExtractor: (item: T) => string
  itemHeight: number
  onReorder: (data: T[]) => void
  // Receives the pan handlers for a dedicated drag handle — attaching them
  // to the whole row (rather than a small grip icon) would swallow taps and
  // fight with swipe-to-delete on the same row.
  renderItem: (item: T, isActive: boolean, dragHandlers: PanResponderInstance['panHandlers']) => React.ReactNode
}

// Hand-rolled on core PanResponder/Animated rather than a third-party
// drag-and-drop list — react-native-draggable-flatlist (built on
// react-native-reanimated) crashed on load in Expo Go regardless of which
// reanimated major version was installed, most likely because the library
// predates reanimated v4's worklet rewrite and Expo Go's SDK-54 native
// binary only ships v4. This avoids the whole native-module version problem
// by not introducing a native dependency at all — displaced rows snap to
// their new position instead of sliding, a reasonable trade for that.
export default function DraggableList<T>({
  data,
  keyExtractor,
  itemHeight,
  onReorder,
  renderItem
}: Props<T>): React.JSX.Element {
  const [order, setOrder] = useState(data)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const dragY = useRef(new Animated.Value(0)).current
  const orderRef = useRef(data)

  useEffect(() => {
    if (activeKey === null) {
      orderRef.current = data
      setOrder(data)
    }
  }, [data, activeKey])

  const makeResponder = (key: string): PanResponderInstance =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setActiveKey(key)
        dragY.setValue(0)
      },
      onPanResponderMove: (_evt, gesture) => {
        dragY.setValue(gesture.dy)
        const currentIndex = orderRef.current.findIndex((item) => keyExtractor(item) === key)
        if (currentIndex === -1) return
        const targetIndex = clamp(
          Math.round((currentIndex * itemHeight + gesture.dy) / itemHeight),
          0,
          orderRef.current.length - 1
        )
        if (targetIndex !== currentIndex) {
          const next = [...orderRef.current]
          const [moved] = next.splice(currentIndex, 1)
          next.splice(targetIndex, 0, moved)
          orderRef.current = next
          setOrder(next)
        }
      },
      onPanResponderRelease: () => {
        setActiveKey(null)
        dragY.setValue(0)
        onReorder(orderRef.current)
      },
      onPanResponderTerminate: () => {
        setActiveKey(null)
        dragY.setValue(0)
      }
    })

  return (
    <View style={{ height: order.length * itemHeight }}>
      {order.map((item, index) => {
        const key = keyExtractor(item)
        const isActive = key === activeKey
        const responder = makeResponder(key)
        return (
          <Animated.View
            key={key}
            style={[
              styles.row,
              {
                height: itemHeight,
                top: isActive ? Animated.add(index * itemHeight, dragY) : index * itemHeight,
                zIndex: isActive ? 1 : 0,
                elevation: isActive ? 4 : 0
              }
            ]}
          >
            {renderItem(item, isActive, responder.panHandlers)}
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0 }
})
