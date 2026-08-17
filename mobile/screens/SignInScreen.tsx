import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useStore } from '../state/store'
import { colors, radii } from '../theme'

export default function SignInScreen(): React.JSX.Element {
  const signIn = useStore((s) => s.signIn)
  const signUp = useStore((s) => s.signUp)
  const resetPassword = useStore((s) => s.resetPassword)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  const handle = async (action: 'signIn' | 'signUp'): Promise<void> => {
    if (!email.trim() || !password) return
    setBusy(true)
    setError(null)
    setResetMessage(null)
    try {
      if (action === 'signIn') await signIn(email.trim(), password)
      else await signUp(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleForgotPassword = async (): Promise<void> => {
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password?" again.')
      return
    }
    setBusy(true)
    setError(null)
    setResetMessage(null)
    try {
      await resetPassword(email.trim())
      setResetMessage(`Check ${email.trim()} for a password reset link.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Empire Pod</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {resetMessage && <Text style={styles.success}>{resetMessage}</Text>}
      {busy ? (
        <ActivityIndicator />
      ) : (
        <>
          <Pressable style={styles.button} onPress={() => handle('signIn')}>
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={() => handle('signUp')}>
            <Text style={styles.buttonText}>Create account</Text>
          </Pressable>
          <Pressable onPress={handleForgotPassword}>
            <Text style={styles.forgotLink}>Forgot password?</Text>
          </Pressable>
          <Text style={styles.helper}>
            Use the same email + password as your desktop Empire Pod account.
          </Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24, textAlign: 'center', color: colors.textPrimary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.input,
    padding: 12,
    marginBottom: 12,
    fontSize: 16
  },
  error: { color: colors.danger, marginBottom: 12 },
  success: { color: colors.accent, marginBottom: 12 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.input,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10
  },
  secondary: { backgroundColor: colors.navInactive },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  forgotLink: { textAlign: 'center', color: colors.accent, fontSize: 13, fontWeight: '600', marginTop: 4 },
  helper: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 12 }
})
