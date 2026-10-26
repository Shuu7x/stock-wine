import { createFileRoute, redirect } from '@tanstack/react-router'

// การเรียงลำดับย้ายไปเป็นแท็บของข้อมูลหลัก — ลิงก์เดิมพาไปแท็บนั้น
export const Route = createFileRoute('/_authenticated/settings/sorting')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/lookups', search: { tab: 'sorting' }, replace: true })
  },
})
