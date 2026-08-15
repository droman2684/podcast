import { IPC_CHANNELS } from '@shared/ipcChannels'
import type { AuthState } from '@shared/ipcChannels'
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
