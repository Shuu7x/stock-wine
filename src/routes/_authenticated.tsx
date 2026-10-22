import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { Loading } from '@/components/ui/loading'
import { NoAccess } from '@/components/layout/NoAccess'
import { getSession } from '@/features/auth/api/auth.api'
import { permForPath, useAccess } from '@/lib/permissions'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    if (!(await getSession())) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: () => (
    <AppShell>
      <Gate />
    </AppShell>
  ),
})

/** เปิดหน้าที่ไม่มีสิทธิ์ (เช่น พิมพ์ URL เอง) = แสดงหน้าแจ้ง ไม่ใช่หน้าจริง */
function Gate() {
  const { pathname } = useLocation()
  const { loading, can } = useAccess()
  const need = permForPath(pathname)
  if (need && loading) return <Loading screen />
  if (need && !can(need)) return <NoAccess />
  return <Outlet />
}
