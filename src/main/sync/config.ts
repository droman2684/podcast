// Supabase's anon key is designed to be public (row-level security is what
// actually protects data, not secrecy of this key) — once a real project
// exists, put its URL and anon key here directly so every install just
// works. Env vars remain as an override, mainly so two dev instances can be
// pointed at the same project without editing this file.
export const SUPABASE_URL = process.env.EMPIRE_POD_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.EMPIRE_POD_SUPABASE_ANON_KEY ?? ''

// An install with no Supabase project configured (or a build that predates
// this feature) behaves exactly as it always has — fully local, sync simply
// never runs.
export function isSyncConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}
