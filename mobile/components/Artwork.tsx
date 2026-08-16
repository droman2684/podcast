import { Image, View, StyleSheet } from 'react-native'

interface Props {
  url: string | null
  size: number
  radius?: number
}

export default function Artwork({ url, size, radius = 8 }: Props): React.JSX.Element {
  const dimStyle = { width: size, height: size, borderRadius: radius }
  if (!url) return <View style={[styles.fallback, dimStyle]} />
  return <Image source={{ uri: url }} style={dimStyle} />
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#eee' }
})
