import { readFile } from 'node:fs/promises'

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

// OPML is the format podcast apps (Overcast, Apple Podcasts, Pocket Casts, ...)
// export subscription lists in. Each subscription is an <outline> element with
// an xmlUrl attribute pointing at the feed — that's the only piece we need, so
// a full XML parser is unnecessary overhead.
export function parseOpml(xml: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const outlineRegex = /<outline\b[^>]*\bxmlUrl\s*=\s*"([^"]*)"[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = outlineRegex.exec(xml)) !== null) {
    const url = unescapeXml(match[1]).trim()
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}

export async function readOpmlFeedUrls(filePath: string): Promise<string[]> {
  const xml = await readFile(filePath, 'utf-8')
  return parseOpml(xml)
}
