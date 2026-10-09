import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/AppShell'
import { getSession } from '@/features/auth/api/auth.api'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    if (!(await getSession())) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
