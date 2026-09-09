// Many feeds wrap titles/descriptions in CDATA with the text already
// HTML-entity-escaped (WordPress-style podcast hosts do this a lot) — CDATA
// content passes through the XML parser verbatim, so "&#039;" etc. never
// gets decoded there and shows up literally (e.g. "Don&#039;t") unless we
// decode it ourselves. Used for every plain-text field pulled out of a feed
// (title, description, author…), not just the stripHtml preview below.
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
}

// Episode descriptions from RSS feeds are frequently HTML (paragraphs,
// links, bold text) — this is a plain-text fallback rather than a full
// renderer, good enough for a one-paragraph preview in a list row.
export function stripHtml(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
