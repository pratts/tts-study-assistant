import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { Note, UpdateNoteRequest } from '@/api/types'
import { FormError } from '@/components/form-error'
import { TextField } from '@/components/text-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useCreateNote, useUpdateNote } from '@/hooks/use-notes'
import { applyServerError } from '@/lib/forms'
import { noteSchema, type NoteValues } from '@/lib/validation'

const API_FIELDS = { content: 'content', source_url: 'sourceUrl', source_title: 'sourceTitle', domain: 'domain' } as const

function toValues(note?: Note | null): NoteValues {
  return {
    content: note?.content ?? '',
    sourceUrl: note?.source_url ?? '',
    sourceTitle: note?.source_title ?? '',
    domain: note?.domain ?? '',
  }
}

type Props = {
  open: boolean
  /** The note to edit; omit to create. */
  note?: Note | null
  onOpenChange: (open: boolean) => void
  onSaved: (note: Note) => void
}

export function NoteFormDialog({ open, note, onOpenChange, onSaved }: Props) {
  const editing = Boolean(note)
  const create = useCreateNote()
  const update = useUpdateNote()
  const form = useForm<NoteValues>({ resolver: zodResolver(noteSchema), defaultValues: toValues(note) })
  const { errors, isSubmitting } = form.formState

  useEffect(() => {
    if (open) form.reset(toValues(note))
  }, [open, note, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      let saved: Note
      if (note) {
        // Send every field so clearing one (empty string) clears it on the server.
        const body: UpdateNoteRequest = {
          content: values.content,
          source_url: values.sourceUrl,
          source_title: values.sourceTitle,
          domain: values.domain,
        }
        saved = await update.mutateAsync({ id: note.id, body })
      } else {
        saved = await create.mutateAsync({
          content: values.content,
          source_url: values.sourceUrl || undefined,
          source_title: values.sourceTitle || undefined,
          domain: values.domain || undefined,
        })
      }
      toast.success(editing ? 'Note updated' : 'Note created')
      onSaved(saved)
      onOpenChange(false)
    } catch (error) {
      applyServerError(form.setError, error, API_FIELDS)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit note' : 'New note'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Changing the content clears its summary.' : 'Paste or type the text you want to keep.'}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormError message={errors.root?.server?.message} />
            <TextField id="note-content" label="Content" multiline rows={8} registration={form.register('content')} error={errors.content} />
            <TextField
              id="note-source-title"
              label="Source title (optional)"
              registration={form.register('sourceTitle')}
              error={errors.sourceTitle}
            />
            <TextField
              id="note-source-url"
              label="Source URL (optional)"
              type="url"
              placeholder="https://"
              registration={form.register('sourceUrl')}
              error={errors.sourceUrl}
            />
            <TextField
              id="note-domain"
              label="Domain (optional)"
              registration={form.register('domain')}
              error={errors.domain}
              description={editing ? undefined : 'Derived from the source URL when left empty.'}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {editing ? 'Save changes' : 'Create note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
