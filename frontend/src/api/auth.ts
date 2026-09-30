import { requestData } from '@/api/client'
import type { AuthResponse, LoginRequest, RegisterRequest } from '@/api/types'

// The refresh token in AuthResponse is deliberately never stored: sessions
// end when the access token expires (see CLAUDE.md, deliberate deviations).

export function login(body: LoginRequest): Promise<AuthResponse> {
  return requestData<AuthResponse>('/auth/login', { method: 'POST', body: { ...body, source: 'web' }, auth: false })
}

export function register(body: RegisterRequest): Promise<AuthResponse> {
  return requestData<AuthResponse>('/auth/register', { method: 'POST', body, auth: false })
}
