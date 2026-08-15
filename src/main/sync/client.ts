import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSyncConfigured } from './config'

function sessionFilePath(): string {
  return join(app.getPath('userData'), 'sync-session.bin')
}

// Supabase's default session storage is browser localStorage, which doesn't
// exist in the main process — persist it as its own small file instead,
// encrypted with the same OS-keychain-backed safeStorage already used for
// private feed passwords (see src/main/privateFeeds.ts).
const nodeSessionStorage = {
  getItem(_key: string): string | null {
    const path = sessionFilePath()
    if (!existsSync(path)) return null
    try {
      return safeStorage.decryptString(readFileSync(path))
    } catch {
      return null
    }
  },
  setItem(_key: string, value: string): void {
    writeFileSync(sessionFilePath(), safeStorage.encryptString(value))
  },
  removeItem(_key: string): void {
    const path = sessionFilePath()
    if (existsSync(path)) unlinkSync(path)
  }
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSyncConfigured()) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: nodeSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    })
  }
  return client
}
