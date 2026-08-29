// Hand-written structural types for the subset of @supabase/supabase-js this
// sync engine uses — deliberately NOT importing the real package from here.
// src/shared has no node_modules of its own, so a real `import
// '@supabase/supabase-js'` written inside src/shared/*.ts would resolve (via
// Metro's watchFolders/alias, or Node's ancestor lookup for the desktop
// build) against whichever node_modules happens to be nearest on disk —
// today that's root's (2.45.4), not mobile's (2.112.3). Two apps quietly
// sharing one copy of a stateful client library (auth locks, in-memory
// session cache) neither of them installed would be a strange, hard-to-debug
// regression to hide inside the fix for a session/auth bug. Structural
// typing sidesteps this: the real client (whichever version, on whichever
// platform) satisfies this interface by shape, so each platform's own
// already-configured client is passed in as-is, no import needed here.

export interface PostgrestErrorLike {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

export interface AuthErrorLike {
  message: string
  status?: number
  code?: string
}

export interface PostgrestSingleResult<T> {
  data: T | null
  error: PostgrestErrorLike | null
}

export interface PostgrestListResult<T> {
  data: T[] | null
  error: PostgrestErrorLike | null
  count?: number | null
}

export interface PostgrestThenable<T> extends PromiseLike<PostgrestListResult<T>> {
  eq(column: string, value: unknown): PostgrestThenable<T>
  is(column: string, value: null): PostgrestThenable<T>
  range(from: number, to: number): PostgrestThenable<T>
  maybeSingle(): PromiseLike<PostgrestSingleResult<T>>
}

export interface SupabaseTableLike<T = Record<string, unknown>> {
  select(columns: string, opts?: { count?: 'exact' }): PostgrestThenable<T>
  upsert(
    rows: Record<string, unknown> | Record<string, unknown>[]
  ): PromiseLike<PostgrestListResult<T>>
}

export interface RealtimePostgresChangesPayload {
  new?: Record<string, unknown>
  old?: Record<string, unknown>
}

export interface RealtimeChannelLike {
  on(
    event: 'postgres_changes',
    filter: { event: string; schema: string; table: string; filter: string },
    callback: (payload: RealtimePostgresChangesPayload) => void
  ): RealtimeChannelLike
  subscribe(): RealtimeChannelLike
}

export interface SessionLike {
  access_token: string
  user: { id: string }
}

export interface SyncClient {
  from(table: string): SupabaseTableLike
  channel(name: string): RealtimeChannelLike
  removeChannel(channel: RealtimeChannelLike): void
  auth: {
    getSession(): Promise<{ data: { session: SessionLike | null }; error: AuthErrorLike | null }>
    getUser(): Promise<{ data: { user: { id: string } | null }; error: AuthErrorLike | null }>
    refreshSession(): Promise<{ data: { session: SessionLike | null }; error: AuthErrorLike | null }>
    signOut(opts?: { scope?: 'local' | 'global' }): Promise<{ error: AuthErrorLike | null }>
  }
}
