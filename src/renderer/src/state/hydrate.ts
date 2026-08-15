import { useAppStore } from './store'

export async function hydrateApp(): Promise<void> {
  const store = useAppStore.getState()

  store.initSubscriptionUpdates()
  store.initAuth()

  await store.loadSubscriptions()
  await Promise.all([
    store.loadQueue(),
    store.loadQueuePrefs(),
    store.loadPrivateFeeds(),
    store.loadStations(),
    store.loadPositions(),
    store.loadLayout()
  ])

  // Episode lists are populated per-podcast so Home/Library/Episode screens have
  // real data immediately without each screen re-fetching on mount.
  await Promise.all(useAppStore.getState().podcasts.map((p) => store.loadEpisodes(p.id)))
}
