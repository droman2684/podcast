import { describe, it, expect, vi } from 'vitest'
import {
  looksLikeAuthError,
  decodeJwtClaims,
  formatJwtSkewDiagnostics,
  withAuthRetry
} from '../../src/shared/sync/authRetry'
import type { SyncClient } from '../../src/shared/sync/supabaseLike'

function makeToken(claims: Record<string, unknown>): string {
  const base64url = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${base64url({ alg: 'HS256' })}.${base64url(claims)}.signature`
}

describe('looksLikeAuthError', () => {
  it('matches a "JWT issued at future"-style message', () => {
    expect(looksLikeAuthError({ message: 'JWT issued at future' })).toBe(true)
  })
  it('matches an HTTP 401/403 status', () => {
    expect(looksLikeAuthError({ status: 401, message: 'nope' })).toBe(true)
    expect(looksLikeAuthError({ status: 403, message: 'nope' })).toBe(true)
  })
  it('matches a PGRST30x code', () => {
    expect(looksLikeAuthError({ code: 'PGRST301', message: 'anything' })).toBe(true)
  })
  it('does not match an unrelated error', () => {
    expect(looksLikeAuthError({ message: 'network request failed' })).toBe(false)
  })
  it('does not throw on non-object input', () => {
    expect(looksLikeAuthError(null)).toBe(false)
    expect(looksLikeAuthError('boom')).toBe(false)
  })
})

describe('decodeJwtClaims', () => {
  it('decodes a well-formed token', () => {
    const token = makeToken({ iat: 1000, exp: 2000, sub: 'user-1' })
    expect(decodeJwtClaims(token)).toEqual({ iat: 1000, exp: 2000, sub: 'user-1' })
  })
  it('returns null for garbage input', () => {
    expect(decodeJwtClaims('not-a-jwt')).toBe(null)
  })
})

describe('formatJwtSkewDiagnostics', () => {
  it('includes iat/exp/skew when a token is given', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const token = makeToken({ iat: nowSec + 3600, exp: nowSec + 7200 }) // issued an hour in the future
    const line = formatJwtSkewDiagnostics('test', token)
    expect(line).toContain('[auth-diagnostics] test')
    expect(line).toContain('iat=')
    expect(line).toContain('exp=')
    // Negative skew is exactly the "issued in the future" signature.
    expect(line).toMatch(/skewMs\(now-iat\)=-\d+/)
  })
  it('reports n/a for a missing token', () => {
    expect(formatJwtSkewDiagnostics('test', null)).toContain('iat=n/a')
  })
})

function fakeClient(overrides: Partial<SyncClient['auth']> = {}): SyncClient {
  return {
    from: () => {
      throw new Error('not used in these tests')
    },
    channel: () => {
      throw new Error('not used in these tests')
    },
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: { access_token: makeToken({ iat: 1 }), user: { id: 'u1' } } }, error: null }),
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      refreshSession: async () => ({ data: { session: { access_token: makeToken({ iat: 2 }), user: { id: 'u1' } } }, error: null }),
      signOut: async () => ({ error: null }),
      ...overrides
    }
  }
}

describe('withAuthRetry', () => {
  it('returns the first result untouched when there is no error', async () => {
    const client = fakeClient()
    const run = vi.fn(async () => ({ data: 'ok', error: null }))
    const result = await withAuthRetry(client, run)
    expect(result).toEqual({ data: 'ok', error: null })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('passes through a non-auth-shaped error without refreshing', async () => {
    const client = fakeClient()
    const refreshSession = vi.fn(client.auth.refreshSession)
    client.auth.refreshSession = refreshSession
    const run = vi.fn(async () => ({ data: null, error: { message: 'network request failed' } }))
    const result = await withAuthRetry(client, run)
    expect(result.error?.message).toBe('network request failed')
    expect(refreshSession).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('refreshes and retries once on an auth-shaped error, returning the retry result', async () => {
    const client = fakeClient()
    let calls = 0
    const run = vi.fn(async () => {
      calls += 1
      return calls === 1 ? { data: null, error: { message: 'JWT issued at future' } } : { data: 'recovered', error: null }
    })
    const result = await withAuthRetry(client, run)
    expect(result).toEqual({ data: 'recovered', error: null })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('returns the original error, without retrying run(), when refreshSession itself fails', async () => {
    const client = fakeClient({ refreshSession: async () => ({ data: { session: null }, error: { message: 'refresh failed' } }) })
    const run = vi.fn(async () => ({ data: null, error: { message: 'JWT issued at future' } }))
    const result = await withAuthRetry(client, run)
    expect(result.error?.message).toBe('JWT issued at future')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
