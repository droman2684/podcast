import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useStore } from '../state/store'
import { colors, radii } from '../theme'

interface Props {
  onBack: () => void
  // When set, this is "enter password" for a private feed whose identity
  // already synced from another device (see privateFeedsMissingCredential)
  // rather than adding a brand new one — the URL is fixed, only credentials
  // are asked for.
  retryFeedId?: string
}

export default function PrivateFeedScreen({ onBack, retryFeedId }: Props): React.JSX.Element {
  const privateFeeds = useStore((s) => s.privateFeeds)
  const addPrivateFeed = useStore((s) => s.addPrivateFeed)
  const retryPrivateFeedCredential = useStore((s) => s.retryPrivateFeedCredential)

  const retryFeed = retryFeedId ? privateFeeds[retryFeedId] : undefined
  const [url, setUrl] = useState('')
  const [user, setUser] = useState(retryFeed?.user ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (): Promise<void> => {
    setError(null)
    if (retryFeedId) {
      if (!user.trim() || !password) {
        setError('Username and password are required.')
        return
      }
      setBusy(true)
      try {
        await retryPrivateFeedCredential(retryFeedId, user, password)
        onBack()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
      return
    }

    if (!url.trim() || !user.trim() || !password) {
      setError('URL, username, and password are all required.')
      return
    }
    setBusy(true)
    try {
      await addPrivateFeed(url, user, password)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}>
        <Text style={styles.back}>{'‹ Back'}</Text>
      </Pressable>
      <Text style={styles.title}>{retryFeedId ? 'Enter Password' : 'Add Private Feed'}</Text>
      <Text style={styles.helper}>
        {retryFeedId
          ? `${retryFeed?.name ?? 'This feed'} needs its password entered on this device — it never syncs between devices, by design.`
          : 'For password-protected feeds. The password is stored securely on this device only and never synced.'}
      </Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {!retryFeedId && (
        <TextInput
          style={styles.input}
          placeholder="Feed URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
        value={user}
        onChangeText={setUser}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {busy ? (
        <ActivityIndicator style={{ marginTop: 8 }} />
      ) : (
        <Pressable style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>{retryFeedId ? 'Unlock' : 'Add Feed'}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 60, paddingHorizontal: 20 },
  back: { color: colors.accent, marginBottom: 20, fontSize: 15 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  helper: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 20 },
  error: { color: colors.danger, fontSize: 12, marginBottom: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.input,
    padding: 12,
    marginBottom: 12,
    fontSize: 15
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.input,
    padding: 14,
    alignItems: 'center',
    marginTop: 4
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 }
})
