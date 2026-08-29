import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
})

// Supabase's documented React Native requirement, previously missing here:
// autoRefreshToken relies on a JS timer, and RN throttles/suspends those
// while the app is backgrounded — without this, the timer can silently miss
// its refresh window across a background/foreground cycle, so the app
// foregrounds straight into a stale-or-borderline access token. A plausible,
// concrete trigger for the "JWT issued at future"-shaped failures seen on
// the Library screen (see lib/syncAdapters.ts and state/store.ts's
// withAuthRetry wiring for the rest of the defense).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
