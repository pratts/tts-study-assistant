import type { components } from '@/types/api'

// Aliases over the generated schema types. Never hand-write API shapes.
type Schemas = components['schemas']

export type Note = Schemas['Note']
export type NotesStats = Schemas['NotesStats']
export type UserProfile = Schemas['UserProfile']
export type AuthResponse = Schemas['AuthResponse']
export type RegisterRequest = Schemas['RegisterRequest']
export type LoginRequest = Schemas['LoginRequest']
export type CreateNoteRequest = Schemas['CreateNoteRequest']
export type UpdateNoteRequest = Schemas['UpdateNoteRequest']
export type UpdateProfileRequest = Schemas['UpdateProfileRequest']
export type UpdatePasswordRequest = Schemas['UpdatePasswordRequest']
export type SummaryResponse = Schemas['SummaryResponse']
