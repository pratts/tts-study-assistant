import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getProfile, updatePassword, updateProfile } from '@/api/user'
import type { UpdatePasswordRequest, UpdateProfileRequest } from '@/api/types'
import { queryKeys } from '@/lib/query-client'

export function useProfile() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: ({ signal }) => getProfile(signal) })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => updateProfile(body),
    // The response is the updated profile: no refetch needed.
    onSuccess: (profile) => queryClient.setQueryData(queryKeys.profile, profile),
  })
}

export function useUpdatePassword() {
  return useMutation({ mutationFn: (body: UpdatePasswordRequest) => updatePassword(body) })
}
