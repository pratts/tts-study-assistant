import { getToken } from '@/lib/auth'
import { endSession } from '@/lib/session'
import type { components } from '@/types/api'

const baseUrl: string | undefined = import.meta.env.VITE_API_BASE_URL
if (!baseUrl) {
  throw new Error('VITE_API_BASE_URL is not set')
}
export const API_BASE_URL = baseUrl.replace(/\/+$/, '')

export const MESSAGES = {
  network: 'Could not reach the server. Check your connection and try again.',
  server: 'Something went wrong on our side. Please try again.',
  rateLimited: 'Too many requests. Please wait a minute and try again.',
  sessionEnded: 'Your session has ended. Please log in again.',
  unexpected: 'Unexpected response from the server.',
} as const

/** Every failure from the API client. `message` is always safe to show. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly fields?: Record<string, string>

  constructor(status: number, message: string, options: { code?: string; fields?: Record<string, string> } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = options.code
    this.fields = options.fields
  }
}

type ErrorBody = components['schemas']['ErrorResponse'] & { fields?: unknown }

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  /** Send the access token (default). Public endpoints pass false. */
  auth?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(API_BASE_URL + path)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function stringFields(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const entries = Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string')
  return entries.length ? Object.fromEntries(entries) : undefined
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ErrorBody> = {}
  try {
    body = (await res.json()) as Partial<ErrorBody>
  } catch {
    // Non-JSON error body (proxy page, empty body): use the generic message.
  }
  const code = typeof body.code === 'string' ? body.code : undefined
  if (res.status === 429) return new ApiError(429, MESSAGES.rateLimited, { code })
  if (res.status >= 500) return new ApiError(res.status, MESSAGES.server, { code })
  const message = typeof body.message === 'string' && body.message ? body.message : MESSAGES.unexpected
  return new ApiError(res.status, message, { code, fields: stringFields(body.fields) })
}

/**
 * Minimal fetch wrapper. Returns the parsed JSON body (or undefined for 204).
 * Throws ApiError on HTTP and network failures; aborts propagate unchanged.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (auth) {
    const token = getToken()
    if (!token) {
      endSession('expired')
      throw new ApiError(401, MESSAGES.sessionEnded, { code: 'TOKEN_EXPIRED' })
    }
    headers.Authorization = `Bearer ${token}`
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    // Cancellation (TanStack Query, unmounts) is not an error to report.
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) throw err
    throw new ApiError(0, MESSAGES.network)
  }

  if (!res.ok) {
    const error = await toApiError(res)
    // Only TOKEN_EXPIRED means the session is gone; other 401s (e.g. bad
    // login credentials) are ordinary errors.
    if (auth && res.status === 401 && error.code === 'TOKEN_EXPIRED') {
      endSession('expired')
      throw new ApiError(401, MESSAGES.sessionEnded, { code: error.code })
    }
    throw error
  }

  if (res.status === 204) {
    // Read the empty body to the end; Chrome reports unread bodies as cancelled.
    await res.arrayBuffer()
    return undefined as T
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError(res.status, MESSAGES.unexpected)
  }
}

type Envelope<T> = components['schemas']['SuccessResponse'] & { data: T }

/** Unwraps the `{ success, message, data }` envelope. */
export async function requestData<T>(path: string, options?: RequestOptions): Promise<T> {
  const res = await request<Envelope<T>>(path, options)
  if (!res || typeof res !== 'object' || !('data' in res)) throw new ApiError(200, MESSAGES.unexpected)
  return res.data
}
