import { z } from 'zod'

// Zod v4 compiles validators with Function() by default, which a CSP
// without 'unsafe-eval' blocks.
z.config({ jitless: true })

/*
 * These rules mirror the backend (backend/internal/handlers/validate.go and
 * the handlers). Lengths are measured the way Go measures them: bytes for
 * len(), code points for utf8.RuneCountInString.
 */
export const LIMITS = {
  passwordBytes: 72, // bcrypt input limit
  emailBytes: 254,
  nameRunes: 100,
  contentRunes: 100_000,
  sourceUrlBytes: 2048,
  sourceTitleRunes: 512,
  domainBytes: 253,
} as const

const encoder = new TextEncoder()
export const byteLength = (s: string) => encoder.encode(s).length
export const runeLength = (s: string) => [...s].length

// Go's net/mail accepts a plain dot-atom address (non-ASCII allowed); the
// backend also rejects display names and quoted forms because it requires
// the parsed address to equal the input.
const atext = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\uFFFF-]+"
const dotAtom = `${atext}(?:\\.${atext})*`
const EMAIL_RE = new RegExp(`^${dotAtom}@${dotAtom}$`)

/** Trimmed and lower-cased like the backend, then validated. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .refine((v) => byteLength(v) <= LIMITS.emailBytes, 'Email is too long')
  .refine((v) => EMAIL_RE.test(v), 'Enter a valid email address')

export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .refine((v) => byteLength(v) <= LIMITS.passwordBytes, `Password must be at most ${LIMITS.passwordBytes} bytes`)

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .refine((v) => runeLength(v) <= LIMITS.nameRunes, `Name must be at most ${LIMITS.nameRunes} characters`)

// Login only requires both fields; the server answers "Invalid credentials"
// for anything else, so the client doesn't reveal which part is wrong.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
})

export const profileSchema = z.object({
  name: nameSchema,
  email: emailSchema,
})

export const passwordChangeSchema = z
  .object({
    oldPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

const optionalBytes = (max: number, label: string) =>
  z.string().trim().refine((v) => byteLength(v) <= max, `${label} must be at most ${max} bytes`)

export const noteSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .refine((v) => v.trim().length > 0, 'Content is required')
    .refine((v) => runeLength(v) <= LIMITS.contentRunes, `Content must be at most ${LIMITS.contentRunes.toLocaleString('en-US')} characters`),
  sourceUrl: optionalBytes(LIMITS.sourceUrlBytes, 'Source URL'),
  sourceTitle: z
    .string()
    .trim()
    .refine((v) => runeLength(v) <= LIMITS.sourceTitleRunes, `Source title must be at most ${LIMITS.sourceTitleRunes} characters`),
  domain: optionalBytes(LIMITS.domainBytes, 'Domain'),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
export type ProfileValues = z.infer<typeof profileSchema>
export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>
export type NoteValues = z.infer<typeof noteSchema>
