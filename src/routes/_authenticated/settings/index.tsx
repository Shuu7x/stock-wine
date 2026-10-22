import { createFileRoute, Navigate } from '@tanstack/react-router'
import { Loading } from '@/components/ui/loading'
import { SETTINGS_SECTIONS } from '@/features/settings/registry'
import { permForPath, useAccess } from '@/lib/permissions'

export const Route = createFileRoute('/_authenticated/settings/')({
  component: SettingsHome,
})

/** เปิดหัวข้อแรกที่ผู้ใช้มีสิทธิ์ (พนักงานไปที่ "การแสดงผล") */
function SettingsHome() {
  const { loading, can } = useAccess()
  if (loading) return <Loading screen />
  const first = SETTINGS_SECTIONS.find((s) => s.to && can(permForPath(s.to)))
  return <Navigate to={first?.to ?? '/settings/display'} replace />
}
