import { IPC_CHANNELS } from '@shared/ipcChannels'
import type { AuthState } from '@shared/ipcChannels'
import { looksLikeAuthError } from '@shared/sync/authRetry'
import { getSupabase } from './client'
import { getMainWindow } from '../windowRegistry'

function emitAuthState(state: AuthState): void {
  getMainWindow()?.webContents.send(IPC_CHANNELS.AUTH_STATE_CHANGED_EVENT, state)
}

export async function getAuthState(): Promise<AuthState> {
  const supabase = getSupabase()
  if (!supabase) return { signedIn: false, email: null }
  const { data } = await supabase.auth.getSession()
  return { signedIn: data.session !== null, email: data.session?.user.email ?? null }
}

export async function hasSession(): Promise<boolean> {
  return (await getAuthState()).signedIn
}

// Proactively refreshes a cached-from-disk session before trusting it for
// the first pull of a launch, rather than finding out it's stale only when
// a data call fails. If the refresh itself comes back auth-shaped-broken
// (e.g. a refresh token minted while this machine's clock was wrong, which
// keeps failing until real time catches up no matter how many times it's
// retried), the session is unrecoverable on its own — sign out locally so
// the user gets a clear re-login prompt instead of a permanently-broken
// cached session that fails every sync forever.
export async function ensureFreshSession(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  const { error } = await supabase.auth.refreshSession()
  if (error && looksLikeAuthError(error)) {
    console.error('[auth] session unrecoverable on launch, signing out locally:', error.message)
    await supabase.auth.signOut({ scope: 'local' })
    emitAuthState({ signedIn: false, email: null })
  }
}

// Email/password rather than a magic link or OTP code — those require
// either a customized email template (blocked behind Supabase's "set up
// custom SMTP to edit templates" gate) or the account owner clicking a link
// per device. Password auth needs "Confirm email" turned off in the
// Supabase project's Auth settings (Authentication -> Sign In / Providers ->
// Email) to complete with a session immediately; with it left on, signUp
// still requires an email click before a session exists, same problem as
// the OTP flow this replaced.
export async function signUpWithPassword(email: string, password: string): Promise<AuthState> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Sync is not configured on this build.')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  if (!data.session) {
    throw new Error(
      'Account created, but no session came back — check that "Confirm email" is turned off in Supabase (Authentication -> Sign In / Providers -> Email).'
    )
  }
  const state: AuthState = { signedIn: true, email: data.session.user.email ?? null }
  emitAuthState(state)
  return state
}

export async function signInWithPassword(email: string, password: string): Promise<AuthState> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Sync is not configured on this build.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  const state: AuthState = { signedIn: data.session !== null, email: data.session?.user.email ?? null }
  emitAuthState(state)
  return state
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.auth.signOut()
  emitAuthState({ signedIn: false, email: null })
}
