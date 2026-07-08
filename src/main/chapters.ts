import type { Chapter } from '@shared/types'

interface RawChaptersFile {
  chapters?: unknown
}

interface RawChapter {
  title?: unknown
  startTime?: unknown
  img?: unknown
}

// Pure: validates/coerces whatever came back from a podcast:chapters JSON file
// into our Chapter shape, dropping anything malformed rather than throwing —
// a bad entry in someone's chapters file shouldn't break the whole list.
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

// Fetching chapters happens in the main process like every other network call
// in this app (keeps the renderer's CSP minimal and avoids CORS entirely).
// Any failure (network, non-200, malformed JSON) resolves to an empty list —
// the UI treats "no chapters" and "couldn't load chapters" the same way: hide
// the section rather than surfacing an error for an optional, best-effort feature.
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
