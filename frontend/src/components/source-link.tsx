import { ExternalLinkIcon } from 'lucide-react'
import { safeHttpUrl } from '@/lib/utils'

/** The note's source: a link only for http(s) URLs, plain text otherwise. */
export function SourceLink({ url, title }: { url?: string; title?: string }) {
  const href = safeHttpUrl(url)
  const text = title || url
  if (!text) return <span className="text-muted-foreground">—</span>
  if (!href) return <span className="break-all">{text}</span>
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all underline underline-offset-4">
      {text}
      <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}
