import * as SecureStore from 'expo-secure-store'

// Mirrors the desktop app's approach (src/main/privateFeeds.ts, which uses
// Electron's OS-keychain-backed safeStorage): a private feed's password
// lives ONLY in this device's secure storage, never in Supabase and never
// in the app's regular state — the private_feeds table is identity only
// (id/name/url/user), so a feed added on one device shows up as a
// placeholder needing its password re-entered on every other device. That
// tradeoff is intentional, not a bug: it avoids ever routing a plaintext
// password through a cloud service.
function credentialKey(feedId: string): string {
  return `empirepod.privatefeed.${feedId}`
}

interface PrivateFeedCredential {
  user: string
  password: string
}

export async function getPrivateFeedCredential(feedId: string): Promise<PrivateFeedCredential | null> {
  try {
    const raw = await SecureStore.getItemAsync(credentialKey(feedId))
    return raw ? (JSON.parse(raw) as PrivateFeedCredential) : null
  } catch (err) {
    console.error(`[privateFeed] credential read failed for ${feedId}:`, err)
    return null
  }
}

export async function savePrivateFeedCredential(feedId: string, user: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(credentialKey(feedId), JSON.stringify({ user, password }))
}

export async function deletePrivateFeedCredential(feedId: string): Promise<void> {
  await SecureStore.deleteItemAsync(credentialKey(feedId))
}

// React Native doesn't provide a global btoa/Buffer, unlike the desktop
// app's Node environment (which just uses Buffer.from(...).toString('base64')
// — see src/main/privateFeeds.ts) — so this is a small hand-rolled base64
// encoder rather than pulling in a dependency for one function.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64Encode(input: string): string {
  let output = ''
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i)
    const b = input.charCodeAt(i + 1)
    const c = input.charCodeAt(i + 2)
    const hasB = i + 1 < input.length
    const hasC = i + 2 < input.length
    output += BASE64_CHARS[a >> 2]
    output += BASE64_CHARS[((a & 3) << 4) | (hasB ? b >> 4 : 0)]
    output += hasB ? BASE64_CHARS[((b & 15) << 2) | (hasC ? c >> 6 : 0)] : '='
    output += hasC ? BASE64_CHARS[c & 63] : '='
  }
  return output
}

export function basicAuthHeader(user: string, password: string): string {
  return `Basic ${base64Encode(`${user}:${password}`)}`
}
