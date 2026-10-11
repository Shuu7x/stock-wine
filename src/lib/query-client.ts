import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่'
}

// error ที่แจ้งผู้ใช้ผ่าน toast แล้ว — ปุ่มที่ await mutateAsync จะหยุดที่บรรทัดนั้น (ไม่ปิดหน้าต่าง/ไม่ล้างฟอร์ม)
// และ unhandledrejection ด้านล่างจะไม่รายงานซ้ำเป็น error ใน console
const HANDLED = Symbol.for('stock-wine.handled-error')

function markHandled(error: unknown) {
  if (error && typeof error === 'object') (error as Record<symbol, boolean>)[HANDLED] = true
}

export function installHandledErrorFilter() {
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    if (r && typeof r === 'object' && (r as Record<symbol, boolean>)[HANDLED]) e.preventDefault()
  })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => toast.error(errorMessage(error)),
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      markHandled(error)
      toast.error(errorMessage(error))
    },
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
})
