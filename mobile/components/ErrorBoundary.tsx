import { Component, type ErrorInfo, type ReactNode } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { colors } from '../theme'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string | null
}

// Production/TestFlight builds don't show React Native's red dev-error
// overlay the way Expo Go does — an uncaught render error there is just a
// blank white screen with no indication anything went wrong. This at least
// surfaces the message and stack on-device instead of nothing.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught render error:', error, info.componentStack)
    this.setState({ info: info.componentStack ?? null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>{this.state.error.message}</Text>
          {this.state.error.stack && <Text style={styles.stack}>{this.state.error.stack}</Text>}
          {this.state.info && <Text style={styles.stack}>{this.state.info}</Text>}
        </ScrollView>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 80, paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  message: { fontSize: 14, color: colors.danger, marginBottom: 16 },
  stack: { fontSize: 11, color: colors.textMuted, marginBottom: 16 }
})
