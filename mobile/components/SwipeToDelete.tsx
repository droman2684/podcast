import { useRef } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme'

const DELETE_WIDTH = 84
const OPEN_X = -DELETE_WIDTH
const SWIPE_THRESHOLD = 8

interface Props {
  children: React.ReactNode
  onDelete: () => void
  deleteLabel?: string
}

// Hand-rolled on PanResponder/Animated (both core React Native, no extra
// native module) rather than react-native-gesture-handler — after the SDK
// version fights getting this app running at all, avoiding another native
// dependency that might not match this project's Expo Go version was worth
// the small amount of extra code.
export default function SwipeToDelete({ children, onDelete, deleteLabel = 'Delete' }: Props): React.JSX.Element {
  const translateX = useRef(new Animated.Value(0)).current
  const openRef = useRef(false)

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > SWIPE_THRESHOLD && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_evt, gesture) => {
        const base = openRef.current ? OPEN_X : 0
        translateX.setValue(Math.min(0, Math.max(OPEN_X, base + gesture.dx)))
      },
      onPanResponderRelease: (_evt, gesture) => {
        const base = openRef.current ? OPEN_X : 0
        const shouldOpen = base + gesture.dx < OPEN_X / 2
        openRef.current = shouldOpen
        Animated.spring(translateX, {
          toValue: shouldOpen ? OPEN_X : 0,
          useNativeDriver: true,
          bounciness: 0
        }).start()
      }
    })
  ).current

  const handleDelete = (): void => {
    openRef.current = false
    Animated.timing(translateX, { toValue: 0, duration: 150, useNativeDriver: true }).start()
    onDelete()
  }

  return (
    <View style={styles.container}>
      <View style={styles.deleteBg}>
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>{deleteLabel}</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.foreground, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  deleteBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_WIDTH,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteBtn: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  foreground: { backgroundColor: colors.surface }
})
