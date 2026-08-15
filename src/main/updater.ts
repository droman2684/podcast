import { spawn } from 'node:child_process'
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { UpdateCheckResult } from '@shared/ipcChannels'

// This app is only ever built and run on this one machine (npm run dist:win
// drops a fresh installer in the dev repo's release/ folder), so "checking
// for an update" just means "is there a newer installer sitting there than
// the build that's currently running" — no publish/hosting server needed.
// Overridable via env var so a future move to a different dev machine/path
// is a one-line config change instead of a code change.
const RELEASE_DIR = process.env.EMPIRE_POD_RELEASE_DIR ?? 'E:\\Podcast_App\\release'
const INSTALLER_NAME_RE = /^Empire Pod Setup.*\.exe$/i
const STALE_MARGIN_MS = 5000

function findLatestInstaller(): { path: string; mtimeMs: number } | null {
  if (!existsSync(RELEASE_DIR)) return null
  let latest: { path: string; mtimeMs: number } | null = null
  for (const name of readdirSync(RELEASE_DIR)) {
    if (!INSTALLER_NAME_RE.test(name)) continue
    const path = join(RELEASE_DIR, name)
    const mtimeMs = statSync(path).mtimeMs
    if (!latest || mtimeMs > latest.mtimeMs) latest = { path, mtimeMs }
  }
  return latest
}

export function checkForUpdate(): UpdateCheckResult {
  if (is.dev) return { available: false }
  const installer = findLatestInstaller()
  if (!installer) return { available: false }
  const currentMtimeMs = statSync(app.getAppPath()).mtimeMs
  return { available: installer.mtimeMs > currentMtimeMs + STALE_MARGIN_MS }
}

// Silent NSIS install + relaunch: the installer replaces files while we're
// closing (so nothing has them locked) and `--force-run` brings the app back
// up on the new version without the user touching the installer at all.
export function installUpdate(): void {
  const installer = findLatestInstaller()
  if (!installer) throw new Error('No installer found in release folder')
  spawn(installer.path, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}
