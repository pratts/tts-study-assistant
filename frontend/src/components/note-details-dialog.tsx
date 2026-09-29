import { TriangleAlertIcon } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/query-state'
import { SourceLink } from '@/components/source-link'
import { SpeakButton } from '@/components/speak-button'
import { SummarizeButton } from '@/components/summarize-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useNote } from '@/hooks/use-notes'
import { stopSpeech } from '@/hooks/use-speech'
import { formatDate, SUMMARY_UNAVAILABLE } from '@/lib/notes'
import { displayDomain, runeCount } from '@/lib/utils'

export function NoteDetailsDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { data: note, isPending, isError, error, refetch } = useNote(noteId)

  const close = () => {
    stopSpeech()
    onClose()
  }

  return (
    <Dialog open={noteId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Note details</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {note && (
              <>
                <Badge variant="secondary">{displayDomain(note.domain)}</Badge>
                <span>{formatDate(note.created_at)}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isPending && noteId && (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading note">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {isError && <ErrorState error={error} onRetry={() => void refetch()} title="Could not load the note" />}

        {note && (
          <div className="flex flex-col gap-4">
            {(note.source_title || note.source_url) && (
              <p className="text-sm">
                <span className="text-muted-foreground">Source: </span>
                <SourceLink url={note.source_url} title={note.source_title} />
              </p>
            )}

            <section aria-labelledby="note-content-heading" className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 id="note-content-heading" className="font-medium">
                  Content
                </h3>
                <span className="text-xs text-muted-foreground">{runeCount(note.content)} characters</span>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{note.content}</div>
              <div className="flex gap-2">
                <SpeakButton speechKey={`note:${note.id}`} text={note.content} label="note" withStop />
                <CopyButton text={note.content} label="note" />
              </div>
            </section>

            <Separator />

            <section aria-labelledby="note-summary-heading" className="flex flex-col gap-2">
              <h3 id="note-summary-heading" className="font-medium">
                Summary
              </h3>
              {!note.summary && <SummarizeButton noteId={note.id} />}
              {note.summary === SUMMARY_UNAVAILABLE && (
                <Alert>
                  <TriangleAlertIcon />
                  <AlertDescription>Summary unavailable: the text may be too short or incomplete to summarize.</AlertDescription>
                </Alert>
              )}
              {note.summary && note.summary !== SUMMARY_UNAVAILABLE && (
                <>
                  <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{note.summary}</div>
                  <div className="flex gap-2">
                    <SpeakButton speechKey={`summary:${note.id}`} text={note.summary} label="summary" withStop />
                    <CopyButton text={note.summary} label="summary" />
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
