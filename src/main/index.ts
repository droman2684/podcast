// electron-vite only exposes .env values to the renderer (import.meta.env) —
// the main process needs them loaded into process.env explicitly, and this
// must run before anything below reads EMPIRE_POD_SUPABASE_URL/ANON_KEY
// (see src/main/sync/config.ts).
import 'dotenv/config'
import { app, session, shell, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'
import { setMainWindow } from './windowRegistry'
import { refreshAllPodcasts } from './subscriptions'
import { authHeaderForHost } from './privateFeeds'
import { getSnapshot, persist, persistNow } from './persistence'
import type { WindowBounds } from './persistence'
import { hasSession } from './sync/auth'
import { pullAndMerge, pushDirty, runSyncCycle } from './sync/sync'

const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const INITIAL_REFRESH_DELAY_MS = 5000
const SYNC_INTERVAL_MS = 2 * 60 * 1000
const QUIT_SYNC_TIMEOUT_MS = 3000

const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 800
const MIN_WIDTH = 1080
const MIN_HEIGHT = 640

// A saved position from a display that's since been disconnected (external
// monitor unplugged, resolution changed) would otherwise reopen the window
// off-screen and invisible — only trust bounds whose center still falls
// within some currently-connected display's work area.
function isOnScreen(bounds: WindowBounds): boolean {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      centerX >= workArea.x &&
      centerX <= workArea.x + workArea.width &&
      centerY >= workArea.y &&
      centerY <= workArea.y + workArea.height
    )
  })
}

function createWindow(): void {
  const savedBounds = getSnapshot().windowBounds
  const useSaved = savedBounds !== null && isOnScreen(savedBounds)

  const mainWindow = new BrowserWindow({
    width: useSaved ? Math.max(MIN_WIDTH, savedBounds!.width) : DEFAULT_WIDTH,
    height: useSaved ? Math.max(MIN_HEIGHT, savedBounds!.height) : DEFAULT_HEIGHT,
    x: useSaved ? savedBounds!.x : undefined,
    y: useSaved ? savedBounds!.y : undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#eef0f4',
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.ico') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  setMainWindow(mainWindow)

  const saveBounds = (): void => {
    getSnapshot().windowBounds = mainWindow.getBounds()
    persist()
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev) {
    mainWindow.webContents.on('console-message', (_event, _level, message) => {
      console.log(`[renderer] ${message}`)
    })
  }

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Dev builds must never share a userData directory (and therefore never share
// empire-pod-data.json) with the packaged app — otherwise local testing can
// read, overwrite, or race against a real user's actual subscriptions/queue.
// EMPIRE_POD_INSTANCE additionally splits dev builds from each other, so two
// `npm run dev` processes can run side by side as two independent "devices"
// against the same Supabase project — used to verify cloud sync locally
// without needing two physical machines.
const instanceSuffix = process.env.EMPIRE_POD_INSTANCE ? ` ${process.env.EMPIRE_POD_INSTANCE}` : ''
app.setName(is.dev ? `Empire Pod Dev${instanceSuffix}` : 'Empire Pod')

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.empirepod.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // The <audio> element streaming episode files can't attach an Authorization
  // header itself, so private-feed episodes (gated behind the same
  // credentials as their RSS feed) would otherwise fail to load. Attach the
  // saved credentials for any outgoing request whose host matches a private
  // feed's host — this also transparently covers Range requests, so seeking
  // still works.
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const host = new URL(details.url).host
    const authHeader = authHeaderForHost(host)
    if (authHeader) details.requestHeaders['Authorization'] = authHeader
    callback({ requestHeaders: details.requestHeaders })
  })

  registerIpcHandlers()

  // Pull-and-merge before the window exists so hydrate.ts's existing loadX()
  // calls just see already-reconciled state — the renderer never needs to
  // know cloud sync exists. Only runs at all if a session is already saved;
  // an install that's never signed in behaves exactly as it always has.
  if (await hasSession()) {
    await pullAndMerge().catch((err) => console.error('Initial sync pull failed:', err))
  }
  createWindow()

  setTimeout(() => {
    refreshAllPodcasts().catch((err) => console.error('Initial feed refresh failed:', err))
  }, INITIAL_REFRESH_DELAY_MS)
  setInterval(() => {
    refreshAllPodcasts().catch((err) => console.error('Background feed refresh failed:', err))
  }, REFRESH_INTERVAL_MS)
  setInterval(() => {
    runSyncCycle().catch((err) => console.error('Background sync failed:', err))
  }, SYNC_INTERVAL_MS)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Writes are debounced (see persist() in persistence.ts) — flush synchronously
// before the process actually exits so a change made just before quitting
// (mark-as-played, add a feed, etc.) is never silently lost. The cloud sync
// push is async, though, so it needs an explicit deferral (Electron's
// before-quit doesn't block quitting on its own) — capped so a dead network
// never hangs the app on quit; worst case that last edit pushes on the next
// launch's or next device's sync cycle instead.
let quitting = false
app.on('before-quit', (event) => {
  persistNow()
  if (quitting) return
  event.preventDefault()
  quitting = true
  Promise.race([
    pushDirty().catch((err) => console.error('Final sync push failed:', err)),
    new Promise((resolve) => setTimeout(resolve, QUIT_SYNC_TIMEOUT_MS))
  ]).finally(() => app.quit())
})
