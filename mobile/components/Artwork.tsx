import { useEffect, useState } from 'react'
import { Image, View, StyleSheet } from 'react-native'

interface Props {
  url: string | null
  size: number
  radius?: number
}

export default function Artwork({ url, size, radius = 8 }: Props): React.JSX.Element {
  const dimStyle = { width: size, height: size, borderRadius: radius }
  // A URL that 404s or times out used to just render blank space forever —
  // Image has no built-in fallback, so a load failure has to be tracked
  // explicitly and swapped for the same placeholder a missing url gets.
  // Reset whenever the url itself changes (e.g. a recycled list row), so a
  // past failure for a different artwork doesn't stick around.
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  if (!url || failed) return <View style={[styles.fallback, dimStyle]} />
  return <Image source={{ uri: url }} style={dimStyle} onError={() => setFailed(true)} />
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#eee' }
})
