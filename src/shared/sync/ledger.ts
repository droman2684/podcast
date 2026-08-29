// Per-key "have I already seen something at least this new" bookkeeping,
// shared by both apps' sync engines. A key is a synthetic string like
// `playbackPosition:<episodeId>` or `queue`; the marker is either a
// server-stamped `updated_at` (as epoch ms, pre-migration) or a monotonic
// `rev` (post-migration) — the ledger itself doesn't care which, it just
// compares numbers. See supabase-schema.sql's `rev` migration for why a
// real row's marker must never be allowed to sit at 0: a missing ledger
// entry is treated as 0 below, so a real marker of 0 would be silently
// rejected forever on a device that's never seen that key.
export type SyncLedger = Record<string, number>

export function isRemoteNewer(ledger: SyncLedger, key: string, marker: number | null | undefined): boolean {
  if (marker === null || marker === undefined) return true
  return marker > (ledger[key] ?? 0)
}

// Stamped at the moment of a local edit (marker defaults to now, i.e.
// Date.now() as a stand-in "always newer than anything else we know about"
// value) independent of whether the matching network write actually
// succeeds — an edit this device just made is authoritative from this
// device's point of view whether or not it's reached the server yet. Also
// called with a remote row's own marker when a pull/realtime event is
// accepted, so the next comparison has an up-to-date baseline.
export function touch(ledger: SyncLedger, key: string, marker: number = Date.now()): void {
  ledger[key] = marker
}

// Undoes a touch() when the write it was protecting turned out to fail —
// otherwise a permanently-failed upload would leave the ledger claiming
// "this device knows about an edit as of just now" forever, which could
// block a genuinely newer value from a different device that legitimately
// won the same window from ever being accepted.
export function revert(ledger: SyncLedger, key: string, previousMarker: number | undefined): void {
  if (previousMarker === undefined) delete ledger[key]
  else ledger[key] = previousMarker
}
