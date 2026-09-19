import * as Sentry from '@sentry/react-native'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ErrorUtils = require('react-native/Libraries/vendor/core/ErrorUtils').default

// EXPO_PUBLIC_SENTRY_DSN is intentionally unset until a Sentry project
// exists for this app — Sentry.init() is skipped (not just given a bad
// DSN) so every build stays crash-report-free until that DSN is actually
// provided as an EAS environment variable, rather than silently failing to
// report to a placeholder project.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN

export function initSentry(): void {
  if (!DSN) {
    console.log('[sentry] EXPO_PUBLIC_SENTRY_DSN not set — crash reporting disabled')
    return
  }
  Sentry.init({
    dsn: DSN,
    // Native crashes (the ones a React error boundary can never catch,
    // including the app dying on first open before any JS render happens)
    // are what a bare console.error in ErrorBoundary can't see — this is
    // the actual point of adding Sentry rather than just logging harder.
    enableNativeCrashHandling: true,
    tracesSampleRate: 0
  })

  // ErrorBoundary only sees errors thrown during React's render — an error
  // thrown from an event handler, a timer, or an unawaited promise (most of
  // this codebase's own async store actions, e.g. loadLibrary) never
  // reaches it. This is RN's global JS exception hook, the closest
  // equivalent for everything else.
  const previousHandler = ErrorUtils.getGlobalHandler()
  ErrorUtils.setGlobalHandler((error: unknown, isFatal: boolean) => {
    captureError(error, { isFatal })
    previousHandler?.(error, isFatal)
  })
}

// Best-effort — captureException before init() (or with reporting
// disabled) throws for some SDK versions, and a crash-reporting call is
// never allowed to itself cause a crash while reporting one.
export function captureError(error: unknown, extra?: Record<string, unknown>): void {
  if (!DSN) return
  try {
    Sentry.captureException(error, extra ? { extra } : undefined)
  } catch (err) {
    console.error('[sentry] captureException failed:', err)
  }
}
