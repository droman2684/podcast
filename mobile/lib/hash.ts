import * as Crypto from 'expo-crypto'

// Must produce the exact same value as the desktop app's hashId()
// (src/main/rss.ts — sha1, first 16 hex chars) for a given input. Podcast
// and episode ids are computed this way on both platforms so the same feed
// URL / episode guid resolves to the same row in Supabase regardless of
// which device subscribed or played first — get this wrong and playback
// positions and played-flags silently split into two never-reconciling ids
// per episode.
export async function hashId(input: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, input, {
    encoding: Crypto.CryptoEncoding.HEX
  })
  return digest.slice(0, 16)
}
