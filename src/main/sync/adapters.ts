import type { SyncAdapters, SyncStorageAdapter, NetworkStatusAdapter, ForegroundAdapter } from '@shared/sync/engine'
import type { SyncClient } from '@shared/sync/supabaseLike'
import { getSnapshot, persist } from '../persistence'

// Backs the shared engine's key/value storage contract with persistence.ts's
// existing debounced-write/backup file — no second on-disk store needed.
const storage: SyncStorageAdapter = {
  async getItem(key) {
    return getSnapshot().syncKV[key] ?? null
  },
  async setItem(key, value) {
    getSnapshot().syncKV[key] = value
    persist()
  }
}

// Electron's main process has no NetInfo-equivalent online/offline signal.
// Rather than fake one, writes are always attempted; a genuinely offline
// failure just leaves the item pending in the outbox, which the foreground
// and interval triggers below (see wireOutboxAutoDrain) already retry.
const network: NetworkStatusAdapter = {
  isOnline: () => true,
  onChange: () => () => {}
}

// index.ts's mainWindow 'focus' handler calls notifyForeground() — routed
// through this small registry rather than a direct import, since the
// adapters module is constructed before any window exists, and a window can
// be recreated (app.on('activate')) without the adapters being rebuilt.
const foregroundListeners = new Set<() => void>()

export function notifyForeground(): void {
  for (const cb of foregroundListeners) cb()
}

const foreground: ForegroundAdapter = {
  onForeground(callback) {
    foregroundListeners.add(callback)
    return () => foregroundListeners.delete(callback)
  }
}

const SYNC_INTERVAL_MS = 2 * 60 * 1000

export function createDesktopAdapters(client: SyncClient): SyncAdapters {
  return { client, storage, network, foreground, intervalMs: SYNC_INTERVAL_MS }
}
