// The anon/publishable key is designed to be public — row-level security is
// what actually protects data, not secrecy of this key (same reasoning as
// the desktop app's src/main/sync/config.ts). Must point at the exact same
// Supabase project as the desktop app for sync to mean anything.
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://jzwfemqpdlslrcnfaiuj.supabase.co'
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_7A7qLdnZgw9yhjsia7jmxQ_xOIEFskI'
