import { SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useSummarizeNote } from '@/hooks/use-notes'
import { errorMessage } from '@/lib/forms'
import { SUMMARY_UNAVAILABLE } from '@/lib/notes'

/** Generates a summary; `compact` renders an icon button for table rows. */
export function SummarizeButton({ noteId, compact = false }: { noteId: string; compact?: boolean }) {
  const summarize = useSummarizeNote()

  const run = () =>
    summarize.mutate(noteId, {
      onSuccess: ({ summary }) => {
        if (summary === SUMMARY_UNAVAILABLE) toast.info('Summary unavailable: the text may be too short or incomplete to summarize.')
        else toast.success('Summary ready')
      },
      onError: (error) => toast.error(errorMessage(error)),
    })

  if (compact) {
    return (
      <Button variant="outline" size="icon-sm" aria-label="Generate summary" onClick={run} disabled={summarize.isPending}>
        {summarize.isPending ? <Spinner /> : <SparklesIcon />}
      </Button>
    )
  }
  return (
    <Button variant="outline" size="sm" onClick={run} disabled={summarize.isPending}>
      {summarize.isPending ? <Spinner /> : <SparklesIcon />}
      {summarize.isPending ? 'Generating…' : 'Generate summary'}
    </Button>
  )
}
