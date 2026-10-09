import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '@/features/settings/components/SettingsLayout'

export const Route = createFileRoute('/_authenticated/settings')({
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
