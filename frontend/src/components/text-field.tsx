import type { ReactNode } from 'react'
import type { FieldError as RHFFieldError, UseFormRegisterReturn } from 'react-hook-form'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: RHFFieldError
  description?: ReactNode
  type?: 'text' | 'email' | 'password' | 'url'
  autoComplete?: string
  multiline?: boolean
  rows?: number
  placeholder?: string
}

/** Labelled input wired to React Hook Form, with its error announced. */
export function TextField({ id, label, registration, error, description, type = 'text', autoComplete, multiline, rows, placeholder }: Props) {
  const errorId = `${id}-error`
  const descriptionId = description ? `${id}-description` : undefined
  const describedBy = [error ? errorId : undefined, descriptionId].filter(Boolean).join(' ') || undefined
  const common = { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, placeholder, ...registration }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? <Textarea rows={rows} {...common} /> : <Input type={type} autoComplete={autoComplete} {...common} />}
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      <FieldError id={errorId} errors={[error]} />
    </Field>
  )
}
