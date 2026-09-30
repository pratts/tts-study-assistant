import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { login, register } from '@/api/auth'
import type { AuthResponse, LoginRequest, RegisterRequest } from '@/api/types'
import { queryKeys } from '@/lib/query-client'
import { endSession, safeNextPath, startSession } from '@/lib/session'

/** Starts the session from an auth response and goes to `next` (same-site only). */
function useSessionStart() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  return (res: AuthResponse) => {
    startSession(res.access_token)
    queryClient.setQueryData(queryKeys.profile, res.user)
    void navigate(safeNextPath(params.get('next')), { replace: true })
  }
}

export function useLogin() {
  const onSession = useSessionStart()
  return useMutation({ mutationFn: (body: LoginRequest) => login(body), onSuccess: onSession })
}

export function useRegister() {
  const onSession = useSessionStart()
  return useMutation({ mutationFn: (body: RegisterRequest) => register(body), onSuccess: onSession })
}

export function useLogout() {
  return () => endSession('logout')
}
