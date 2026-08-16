import { Directory, File, Paths } from 'expo-file-system'

// Downloaded audio is device-local only, same as skip durations and default
// library view — never synced through Supabase. Files live in their own
// subdirectory of the document dir so listing them at startup (to restore
// "what's downloaded" state after an app relaunch) doesn't have to walk
// anything else the app writes to disk.
const DOWNLOADS_DIR_NAME = 'downloads'

function downloadsDirectory(): Directory {
  return new Directory(Paths.document, DOWNLOADS_DIR_NAME)
}

function extensionFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  const match = /\.[a-zA-Z0-9]{2,5}$/.exec(clean)
  return match ? match[0] : '.mp3'
}

// Scans the downloads directory once (e.g. on app start) rather than
// stat-ing every episode individually. Filenames are always `${episodeId}${ext}`
// (see downloadEpisode below), so the id is recovered by stripping the
// extension File already parsed out for us.
export function listDownloadedUris(): Record<string, string> {
  const dir = downloadsDirectory()
  if (!dir.exists) return {}
  const map: Record<string, string> = {}
  for (const entry of dir.list()) {
    if (entry instanceof File) {
      const id = entry.name.slice(0, entry.name.length - entry.extension.length)
      map[id] = entry.uri
    }
  }
  return map
}

export async function downloadEpisode(episodeId: string, audioUrl: string): Promise<string> {
  const dir = downloadsDirectory()
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true })
  const target = new File(dir, `${episodeId}${extensionFromUrl(audioUrl)}`)
  const file = await File.downloadFileAsync(audioUrl, target, { idempotent: true })
  return file.uri
}

export function deleteDownload(uri: string): void {
  try {
    const file = new File(uri)
    if (file.exists) file.delete()
  } catch {
    // Already gone — nothing to clean up.
  }
}
