import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError, MESSAGES } from '@/api/client'

/**
 * Puts a failed submission's error on the form: server `fields` errors on
 * their inputs (mapped from API names to form names), everything else as a
 * form-level error under `root.server`.
 */
export function applyServerError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  error: unknown,
  fieldMap: Partial<Record<string, Path<T>>> = {},
): void {
  if (!(error instanceof ApiError)) {
    setError('root.server', { message: MESSAGES.server })
    return
  }
  let placed = false
  for (const [apiField, message] of Object.entries(error.fields ?? {})) {
    const field = fieldMap[apiField] ?? (apiField as Path<T>)
    setError(field, { type: 'server', message })
    placed = true
  }
  if (!placed) setError('root.server', { message: error.message })
}

/** Message for toasts and inline error states. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : MESSAGES.server
}
