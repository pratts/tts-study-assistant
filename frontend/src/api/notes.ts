import { request, requestData } from '@/api/client'
import type { CreateNoteRequest, Note, NotesStats, SummaryResponse, UpdateNoteRequest } from '@/api/types'

export type NotesPageParams = {
  page: number
  pageSize: number
  sourceUrl?: string
}

export function listNotes({ page, pageSize, sourceUrl }: NotesPageParams, signal?: AbortSignal): Promise<Note[]> {
  return requestData<Note[]>('/notes', { query: { page, page_size: pageSize, source_url: sourceUrl }, signal })
}

export function getNote(id: string, signal?: AbortSignal): Promise<Note> {
  return requestData<Note>(`/notes/${encodeURIComponent(id)}`, { signal })
}

export function getNotesStats(signal?: AbortSignal): Promise<NotesStats[]> {
  return requestData<NotesStats[]>('/notes/stats', { signal })
}

export function createNote(body: CreateNoteRequest): Promise<Note> {
  return requestData<Note>('/notes', { method: 'POST', body })
}

export function updateNote(id: string, body: UpdateNoteRequest): Promise<Note> {
  return requestData<Note>(`/notes/${encodeURIComponent(id)}`, { method: 'PUT', body })
}

export async function deleteNote(id: string): Promise<void> {
  await request(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function summarizeNote(id: string): Promise<SummaryResponse> {
  return requestData<SummaryResponse>(`/notes/${encodeURIComponent(id)}/summarize`, { method: 'POST' })
}
