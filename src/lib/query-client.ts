import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => toast.error(errorMessage(error)),
  }),
  mutationCache: new MutationCache({
    onError: (error) => toast.error(errorMessage(error)),
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})
