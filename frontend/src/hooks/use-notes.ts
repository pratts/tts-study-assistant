import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createNote, deleteNote, getNote, getNotesStats, listNotes, summarizeNote, updateNote } from '@/api/notes'
import type { CreateNoteRequest, Note, UpdateNoteRequest } from '@/api/types'
import { queryKeys } from '@/lib/query-client'

export function useNotesPage(page: number, pageSize: number, sourceUrl: string) {
  return useQuery({
    queryKey: queryKeys.notesPage(page, pageSize, sourceUrl),
    queryFn: ({ signal }) => listNotes({ page, pageSize, sourceUrl: sourceUrl || undefined }, signal),
    placeholderData: keepPreviousData,
  })
}

export function useNote(id: string | null) {
  return useQuery({
    queryKey: queryKeys.note(id ?? ''),
    queryFn: ({ signal }) => getNote(id!, signal),
    enabled: Boolean(id),
  })
}

export function useNotesStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: ({ signal }) => getNotesStats(signal) })
}

/** The newest note (first item of the first page). */
export function useLatestNote() {
  return useQuery({
    queryKey: queryKeys.notesPage(1, 1, ''),
    queryFn: ({ signal }) => listNotes({ page: 1, pageSize: 1 }, signal),
    select: (notes) => notes[0] ?? null,
  })
}

/** Lists and stats are refetched after any change to the set of notes. */
function invalidateLists(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['notes'] })
}

export function useCreateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateNoteRequest) => createNote(body),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.note(note.id), note)
      return invalidateLists(queryClient)
    },
  })
}

export function useUpdateNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateNoteRequest }) => updateNote(id, body),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.note(note.id), note)
      return invalidateLists(queryClient)
    },
  })
}

export function useDeleteNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.note(id) })
      return invalidateLists(queryClient)
    },
  })
}

/**
 * Summarizing changes one field of one note. The response is written into
 * the cached note and list pages in place instead of restarting the list.
 */
export function useSummarizeNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => summarizeNote(id),
    onSuccess: ({ summary }, id) => {
      const patch = (note: Note) => (note.id === id ? { ...note, summary } : note)
      queryClient.setQueryData<Note>(queryKeys.note(id), (note) => note && patch(note))
      queryClient.setQueriesData<Note[]>({ queryKey: queryKeys.notes }, (notes) => notes?.map(patch))
    },
  })
}
