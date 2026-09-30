import { toast } from 'sonner'
import type { Note } from '@/api/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteNote } from '@/hooks/use-notes'
import { errorMessage } from '@/lib/forms'
import { truncate } from '@/lib/utils'

export function DeleteNoteDialog({ note, onClose, onDeleted }: { note: Note | null; onClose: () => void; onDeleted: () => void }) {
  const deletion = useDeleteNote()

  const confirm = () => {
    if (!note) return
    deletion.mutate(note.id, {
      onSuccess: () => {
        toast.success('Note deleted')
        onDeleted()
        onClose()
      },
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <AlertDialog open={note !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{truncate(note?.content ?? '', 80)}&rdquo; will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletion.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deletion.isPending}
            onClick={(e) => {
              e.preventDefault() // keep the dialog open until the request finishes
              confirm()
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
