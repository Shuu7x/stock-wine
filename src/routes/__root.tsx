import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
    </>
  ),
  notFoundComponent: () => <div className="p-10 text-center text-muted">ไม่พบหน้าที่ต้องการ</div>,
})
