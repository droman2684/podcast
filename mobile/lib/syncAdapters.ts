import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import type { SyncAdapters } from '@shared/sync/engine'
import type { SyncClient } from '@shared/sync/supabaseLike'

const storage: SyncAdapters['storage'] = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value)
}

const network: SyncAdapters['network'] = {
  // `isConnected` is `null` briefly on startup before NetInfo has an
  // answer — treated as online so an outbox drain isn't skipped on a cold
  // start just because the first reading hasn't landed yet.
  isOnline: () => true,
  onChange: (callback) => {
    const subscription = NetInfo.addEventListener((state) => {
      if (state.isConnected) callback(true)
    })
    return () => subscription()
  }
}

const foreground: SyncAdapters['foreground'] = {
  onForeground: (callback) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') callback()
    })
    return () => subscription.remove()
  }
}

const INTERVAL_MS = 60 * 1000

export function createMobileAdapters(client: SyncClient): SyncAdapters {
  return { client, storage, network, foreground, intervalMs: INTERVAL_MS }
}
