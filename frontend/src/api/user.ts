import { request, requestData } from '@/api/client'
import type { UpdatePasswordRequest, UpdateProfileRequest, UserProfile } from '@/api/types'

export function getProfile(signal?: AbortSignal): Promise<UserProfile> {
  return requestData<UserProfile>('/user/profile', { signal })
}

export function updateProfile(body: UpdateProfileRequest): Promise<UserProfile> {
  return requestData<UserProfile>('/user/profile', { method: 'PUT', body })
}

export async function updatePassword(body: UpdatePasswordRequest): Promise<void> {
  await request('/user/password', { method: 'PUT', body })
}
