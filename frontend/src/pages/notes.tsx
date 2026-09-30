import { ChevronLeftIcon, ChevronRightIcon, EyeIcon, NotebookTextIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import type { Note } from '@/api/types'
import { CopyButton } from '@/components/copy-button'
import { DeleteNoteDialog } from '@/components/delete-note-dialog'
import { NoteDetailsDialog } from '@/components/note-details-dialog'
import { NoteFormDialog } from '@/components/note-form-dialog'
import { EmptyState, ErrorState } from '@/components/query-state'
import { SourceLink } from '@/components/source-link'
import { SummarizeButton } from '@/components/summarize-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useNotesPage } from '@/hooks/use-notes'
import { useStopSpeechOnUnmount } from '@/hooks/use-speech'
import { formatDate } from '@/lib/notes'
import { displayDomain, truncate } from '@/lib/utils'

const PAGE_SIZES = [10, 25, 50, 100] as const
const FILTER_DEBOUNCE_MS = 300

function positiveInt(value: string | null, fallback: number) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export default function NotesPage() {
  useStopSpeechOnUnmount()
  const [params, setParams] = useSearchParams()
  const page = positiveInt(params.get('page'), 1)
  const sizeParam = positiveInt(params.get('size'), 10)
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : 10
  const sourceUrl = params.get('source') ?? ''

  const [viewing, setViewing] = useState<string | null>(null)
  const [editing, setEditing] = useState<Note | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Note | null>(null)
  const [sourceInput, setSourceInput] = useState(sourceUrl)

  // Follow the URL when it changes from outside (back/forward, clear).
  const [appliedSource, setAppliedSource] = useState(sourceUrl)
  if (sourceUrl !== appliedSource) {
    setAppliedSource(sourceUrl)
    if (sourceInput.trim() !== sourceUrl) setSourceInput(sourceUrl)
  }

  const notes = useNotesPage(page, pageSize, sourceUrl)

  const update = (changes: Record<string, string | number | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || (key === 'page' && value === 1) || (key === 'size' && value === 10)) next.delete(key)
        else next.set(key, String(value))
      }
      return next
    })

  /** After any change to the set of notes, the list restarts at page 1. */
  const restart = () => update({ page: 1 })

  // Apply the source filter as the user types, once they pause.
  useEffect(() => {
    const next = sourceInput.trim()
    if (next === sourceUrl) return
    const timer = setTimeout(() => update({ source: next, page: 1 }), FILTER_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  const applyFilter = (e: FormEvent) => {
    e.preventDefault()
    update({ source: sourceInput.trim(), page: 1 })
  }
  const clearFilter = () => {
    setSourceInput('')
    update({ source: null, page: 1 })
  }

  const rows = notes.data ?? []
  const hasNext = rows.length === pageSize

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={applyFilter} role="search" className="flex w-full max-w-md flex-col gap-1.5">
          <Label htmlFor="source-filter">Filter by source URL</Label>
          <div className="flex gap-2">
            <Input
              id="source-filter"
              type="url"
              placeholder="https://example.com/article"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              aria-describedby="source-filter-hint"
            />
            <Button type="submit" variant="outline" size="icon" aria-label="Apply source filter">
              <SearchIcon />
            </Button>
            {sourceUrl && (
              <Button type="button" variant="ghost" size="icon" aria-label="Clear source filter" onClick={clearFilter}>
                <XIcon />
              </Button>
            )}
          </div>
          <p id="source-filter-hint" className="text-xs text-muted-foreground">
            Shows notes saved from exactly this URL.
          </p>
        </form>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> New note
        </Button>
      </div>

      {notes.isError && <ErrorState error={notes.error} onRetry={() => void notes.refetch()} title="Could not load notes" />}

      {notes.isPending && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading notes">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {notes.isSuccess && rows.length === 0 && (
        <EmptyState
          icon={NotebookTextIcon}
          title={sourceUrl ? 'No notes from this source' : page > 1 ? 'No more notes' : 'No notes yet'}
          description={sourceUrl ? 'Check the URL or clear the filter.' : page > 1 ? 'This page is empty.' : 'Create your first note, or save text with the extension.'}
          action={
            sourceUrl ? (
              <Button variant="outline" onClick={clearFilter}>
                Clear filter
              </Button>
            ) : page > 1 ? (
              <Button variant="outline" onClick={restart}>
                Back to the first page
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <PlusIcon /> New note
              </Button>
            )
          }
        />
      )}

      {rows.length > 0 && (
        <div className="rounded-md border" aria-busy={notes.isFetching}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="hidden lg:table-cell">Source</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((note) => (
                <TableRow key={note.id}>
                  <TableCell>
                    <Badge variant="secondary">{displayDomain(note.domain)}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{truncate(note.content, 50)}</TableCell>
                  <TableCell className="hidden max-w-60 whitespace-normal lg:table-cell">
                    <SourceLink url={note.source_url} title={note.source_title} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(note.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="icon-sm" aria-label="View note" onClick={() => setViewing(note.id)}>
                        <EyeIcon />
                      </Button>
                      <CopyButton text={note.content} label="note" />
                      {!note.summary && <SummarizeButton noteId={note.id} compact />}
                      <Button variant="outline" size="icon-sm" aria-label="Edit note" onClick={() => setEditing(note)}>
                        <PencilIcon />
                      </Button>
                      <Button variant="outline" size="icon-sm" aria-label="Delete note" onClick={() => setDeleting(note)}>
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(rows.length > 0 || page > 1) && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => update({ page: page - 1 })}>
              <ChevronLeftIcon /> Previous
            </Button>
            <span className="text-sm tabular-nums" aria-live="polite">
              Page {page}
            </span>
            <Button variant="outline" size="sm" disabled={!hasNext || notes.isPlaceholderData} onClick={() => update({ page: page + 1 })}>
              Next <ChevronRightIcon />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="page-size" className="text-sm">
              Per page
            </Label>
            <Select value={String(pageSize)} onValueChange={(v) => update({ size: Number(v), page: 1 })}>
              <SelectTrigger id="page-size" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </nav>
      )}

      <NoteDetailsDialog noteId={viewing} onClose={() => setViewing(null)} />
      <NoteFormDialog open={creating} onOpenChange={setCreating} onSaved={restart} />
      <NoteFormDialog open={editing !== null} note={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={restart} />
      <DeleteNoteDialog note={deleting} onClose={() => setDeleting(null)} onDeleted={restart} />
    </div>
  )
}
