import { createFileRoute, redirect } from '@tanstack/react-router'

// คลังสินค้าย้ายไปอยู่ใน "ข้อมูลหลัก" แล้ว
export const Route = createFileRoute('/_authenticated/settings/stores')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/lookups', search: { tab: 'stores' } })
  },
})
