import { describe, it, expect } from 'vitest'
import { isRemoteNewer, touch, revert, type SyncLedger } from '../../src/shared/sync/ledger'

describe('isRemoteNewer', () => {
  it('accepts a row when the ledger has no entry for its key yet', () => {
    const ledger: SyncLedger = {}
    expect(isRemoteNewer(ledger, 'queue', 5)).toBe(true)
  })

  it('accepts a row with a null/undefined marker unconditionally', () => {
    const ledger: SyncLedger = { queue: 100 }
    expect(isRemoteNewer(ledger, 'queue', null)).toBe(true)
    expect(isRemoteNewer(ledger, 'queue', undefined)).toBe(true)
  })

  it('rejects a marker not strictly newer than what the ledger already knows', () => {
    const ledger: SyncLedger = { queue: 100 }
    expect(isRemoteNewer(ledger, 'queue', 100)).toBe(false)
    expect(isRemoteNewer(ledger, 'queue', 99)).toBe(false)
  })

  it('accepts a strictly newer marker', () => {
    const ledger: SyncLedger = { queue: 100 }
    expect(isRemoteNewer(ledger, 'queue', 101)).toBe(true)
  })

  it('treats a missing ledger entry as 0 — a real marker of 0 is correctly rejected as not newer', () => {
    // This is the exact hazard the rev-column migration must avoid: every
    // real row must get a non-zero rev on backfill, or it would be
    // indistinguishable from "never synced" and get silently skipped
    // forever on a device that's never seen it.
    const ledger: SyncLedger = {}
    expect(isRemoteNewer(ledger, 'playbackPosition:e1', 0)).toBe(false)
  })
})

describe('touch/revert', () => {
  it('touch stamps the given marker', () => {
    const ledger: SyncLedger = {}
    touch(ledger, 'queue', 42)
    expect(ledger.queue).toBe(42)
  })

  it('revert restores a previous marker', () => {
    const ledger: SyncLedger = { queue: 42 }
    touch(ledger, 'queue', 99)
    revert(ledger, 'queue', 42)
    expect(ledger.queue).toBe(42)
  })

  it('revert with an undefined previous marker deletes the key entirely', () => {
    const ledger: SyncLedger = {}
    touch(ledger, 'queue', 99)
    revert(ledger, 'queue', undefined)
    expect('queue' in ledger).toBe(false)
  })
})
