import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retry only transient failures (network, 5xx), never 4xx or 429.
        retry: (count, error) =>
          count < 2 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
      },
      mutations: { retry: false },
    },
  })
}

export const queryKeys = {
  profile: ['profile'] as const,
  stats: ['notes', 'stats'] as const,
  notes: ['notes', 'list'] as const,
  notesPage: (page: number, pageSize: number, sourceUrl: string) => ['notes', 'list', { page, pageSize, sourceUrl }] as const,
  note: (id: string) => ['notes', 'detail', id] as const,
}
