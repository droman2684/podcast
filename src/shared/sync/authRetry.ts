import type { SyncClient } from './supabaseLike'

// Matches: HTTP 401/403, PostgREST's PGRST30x auth-rejection codes, and the
// message text Supabase/PostgREST actually use for a bad/stale/future-dated
// token ("JWT expired", "JWT issued at future", "invalid claim: missing sub",
// "signature is invalid", etc). Deliberately broad — a false positive here
// just costs one harmless extra refreshSession() + retry, while a false
// negative leaves a real auth failure undiagnosed and unretried, which is
// the actual bug this exists to fix.
const AUTH_ERROR_PATTERN = /jwt|token|issued|not.?yet.?valid|invalid claim|expired|\biat\b|signature/i

export function looksLikeAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { message?: string; status?: number; code?: string }
  if (e.status === 401 || e.status === 403) return true
  if (typeof e.code === 'string' && /^PGRST30\d$/.test(e.code)) return true
  return typeof e.message === 'string' && AUTH_ERROR_PATTERN.test(e.message)
}

// Manual base64 decode rather than atob()/Buffer — neither is guaranteed
// available in React Native's Hermes engine, and this needs to run
// identically on mobile and desktop without pulling in a platform shim.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64Decode(input: string): string {
  let output = ''
  let buffer = 0
  let bits = 0
  for (const char of input) {
    if (char === '=') break
    const value = BASE64_CHARS.indexOf(char)
    if (value === -1) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output += String.fromCharCode((buffer >> bits) & 0xff)
    }
  }
  return output
}

export interface JwtClaims {
  iat?: number
  exp?: number
  sub?: string
  [key: string]: unknown
}

export function decodeJwtClaims(token: string): JwtClaims | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(base64Decode(padded)) as JwtClaims
  } catch {
    return null
  }
}

// Logs enough to actually diagnose a future recurrence of "JWT issued at
// future" (real iat/exp/skew) instead of the bare, un-actionable error
// string this app surfaced before — see authRetry's doc comment on
// withAuthRetry for why this fires around every refresh attempt.
export function formatJwtSkewDiagnostics(label: string, token: string | null | undefined): string {
  const nowMs = Date.now()
  const claims = token ? decodeJwtClaims(token) : null
  const iatMs = claims?.iat ? claims.iat * 1000 : null
  const expMs = claims?.exp ? claims.exp * 1000 : null
  const skewMs = iatMs !== null ? nowMs - iatMs : null
  return (
    `[auth-diagnostics] ${label}: now=${new Date(nowMs).toISOString()} ` +
    `iat=${iatMs !== null ? new Date(iatMs).toISOString() : 'n/a'} ` +
    `exp=${expMs !== null ? new Date(expMs).toISOString() : 'n/a'} ` +
    `skewMs(now-iat)=${skewMs ?? 'n/a'}`
  )
}

// Structural constraint only — deliberately not tied to any one concrete
// result shape (PostgrestListResult, PostgrestSingleResult, the auth
// methods' own result types all differ in their `data`/extra fields) so
// this wraps any Supabase-shaped call without forcing an intermediate type
// that would have to exactly match every one of them.
export interface HasAuthLikeError {
  error: { message?: string; status?: number; code?: string } | null
}

// Runs `run()`; on an auth-shaped error, logs skew diagnostics, attempts one
// refreshSession(), logs again, and retries `run()` once. If the refresh
// itself fails, the session is likely unrecoverable on its own (e.g. a
// refresh token minted while the device clock was wrong keeps failing until
// real time catches up regardless of how many times it's retried) — that's
// returned as-is so the caller's own error handling fires; callers that can
// treat this as terminal (see mobile's initAuth) should check
// looksLikeAuthError on the result and sign out rather than retrying forever.
export async function withAuthRetry<R extends HasAuthLikeError>(
  client: SyncClient,
  run: () => PromiseLike<R>
): Promise<R> {
  const first = await run()
  if (!first.error || !looksLikeAuthError(first.error)) return first

  const { data: sessionData } = await client.auth.getSession()
  console.error(formatJwtSkewDiagnostics('pre-refresh', sessionData.session?.access_token), first.error)

  const { data: refreshed, error: refreshError } = await client.auth.refreshSession()
  if (refreshError) {
    console.error('[auth] refreshSession failed after an auth-shaped error — session likely unrecoverable:', refreshError)
    return first
  }
  console.error(formatJwtSkewDiagnostics('post-refresh', refreshed.session?.access_token))

  return run()
}
