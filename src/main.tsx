import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { env } from '@/lib/env'
import { applyFontScale, getFontScale } from '@/lib/font-scale'
import { installHandledErrorFilter, queryClient } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { routeTree } from './routeTree.gen'
import { Loading } from '@/components/ui/loading'
import './index.css'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingMs: 300,
  defaultPendingComponent: () => <Loading screen />,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function enableMocking() {
  if (!env.VITE_ENABLE_MOCK) return
  const { worker } = await import('@/mocks/browser')
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
}

installHandledErrorFilter()
// ขนาดตัวหนังสือที่ตั้งไว้ในเครื่องนี้ (ใช้ก่อน render ไม่ให้กะพริบ)
applyFontScale(getFontScale())

// session หมดอายุ / ออกจากระบบจากแท็บอื่น: ทิ้งข้อมูลของผู้ใช้เดิม แล้วให้หน้าที่เปิดอยู่กลับไปล็อกอิน
supabase.auth.onAuthStateChange((event) => {
  if (event !== 'SIGNED_OUT') return
  // ออกจากหน้าแอปก่อน แล้วค่อยล้าง (กันหน้าที่เปิดอยู่ดึงข้อมูลซ้ำตอนไม่มีสิทธิ์)
  const leave = location.pathname.startsWith('/login') ? Promise.resolve() : router.navigate({ to: '/login' })
  leave.then(() => queryClient.clear())
})

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
