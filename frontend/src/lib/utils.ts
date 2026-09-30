export { cn } from 'cn'

/** Returns the URL if it is http(s); anything else must not become a link. */
export function safeHttpUrl(value: string | undefined | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

// Notes saved by the extension from Chrome's built-in PDF viewer or from
// local files have no web domain.
const LOCAL_SOURCES = new Set(['mhjfbmdgcfjbbpaeojofohoefgiehjai', 'local-file'])

export function displayDomain(domain: string | undefined): string {
  if (!domain) return 'Unknown'
  return LOCAL_SOURCES.has(domain) ? 'Downloaded/Local file' : domain
}

/** Characters as a person counts them (code points, so emoji count once). */
export function runeCount(text: string): number {
  return [...text].length
}

export function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length <= max ? text : chars.slice(0, max).join('') + '…'
}
