import type { Chapter } from '@shared/types'

interface RawChaptersFile {
  chapters?: unknown
}

interface RawChapter {
  title?: unknown
  startTime?: unknown
  img?: unknown
}

// Mirrors the desktop app's src/main/chapters.ts exactly: validates/coerces
// whatever came back from a podcast:chapters JSON file into our Chapter
// shape, dropping anything malformed rather than throwing.
export function normalizeChapters(raw: unknown): Chapter[] {
  const file = raw as RawChaptersFile
  if (!file || !Array.isArray(file.chapters)) return []

  const chapters: Chapter[] = []
  for (const entry of file.chapters as RawChapter[]) {
    if (typeof entry?.title !== 'string' || typeof entry?.startTime !== 'number') continue
    chapters.push({
      title: entry.title,
      startTime: entry.startTime,
      img: typeof entry.img === 'string' ? entry.img : null
    })
  }
  return chapters.sort((a, b) => a.startTime - b.startTime)
}

// Any failure (network, non-200, malformed JSON) resolves to an empty list —
// chapters are optional and best-effort, so a bad fetch just hides the
// section rather than surfacing an error.
export async function fetchChapters(url: string): Promise<Chapter[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    return normalizeChapters(json)
  } catch (err) {
    console.error(`Failed to fetch chapters from ${url}:`, err)
    return []
  }
}
