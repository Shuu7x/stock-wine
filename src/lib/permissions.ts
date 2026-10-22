/**
 * สิทธิ์การใช้งาน (role-based) — ตรงกับ migration 20261018 (roles / profiles / has_perm)
 * ฐานข้อมูลบังคับจริง · หน้าเว็บใช้ซ่อนเมนู/ปุ่มและกันเปิดหน้าที่ไม่มีสิทธิ์
 */
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { MyAccess } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export const PERMISSIONS = [
  { key: 'stock.edit', label: 'แก้/ลบข้อมูลไวน์', group: 'สต็อก' },
  { key: 'withdraw', label: 'เบิก', group: 'ทำรายการ' },
  { key: 'receive', label: 'รับเข้า', group: 'ทำรายการ' },
  { key: 'transfer', label: 'โอนย้าย', group: 'ทำรายการ' },
  { key: 'sale', label: 'ขาย / พิมพ์บิล', group: 'ทำรายการ' },
  { key: 'adjust', label: 'ปรับยอด', group: 'ทำรายการ' },
  { key: 'history.view', label: 'ดูความเคลื่อนไหว', group: 'เครื่องมือ' },
  { key: 'history.void', label: 'ยกเลิกเอกสาร', group: 'เครื่องมือ' },
  { key: 'qr', label: 'พิมพ์ป้าย QR', group: 'เครื่องมือ' },
  { key: 'settings.manage', label: 'ตั้งค่าระบบ · ข้อมูลหลัก', group: 'ตั้งค่า' },
  { key: 'users.manage', label: 'ผู้ใช้และสิทธิ์', group: 'ตั้งค่า' },
] as const
export type Permission = (typeof PERMISSIONS)[number]['key']

/** หน้าที่ต้องมีสิทธิ์ (ขึ้นต้นด้วย path นี้) · ไม่อยู่ในรายการ = ทุกคนเปิดได้ */
const ROUTE_PERMS: Array<[prefix: string, perm: Permission]> = [
  ['/withdraw', 'withdraw'],
  ['/receive', 'receive'],
  ['/transfer', 'transfer'],
  ['/sale', 'sale'],
  ['/adjust', 'adjust'],
  ['/history', 'history.view'],
  ['/qr', 'qr'],
  ['/settings/users', 'users.manage'],
  ['/settings/general', 'settings.manage'],
  ['/settings/bill', 'settings.manage'],
  ['/settings/lookups', 'settings.manage'],
  ['/settings/stores', 'settings.manage'],
  ['/settings/sorting', 'settings.manage'],
]
export function permForPath(pathname: string): Permission | null {
  return ROUTE_PERMS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] ?? null
}

export const accessKeys = { me: ['access', 'me'] as const }

export const myAccessOptions = () =>
  queryOptions({
    queryKey: accessKeys.me,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_access')
      if (error) throw error
      return data as MyAccess
    },
    staleTime: 60_000,
  })

/** สิทธิ์ของผู้ใช้ที่ login อยู่ · ระหว่างโหลด can() = false */
export function useAccess() {
  const q = useQuery(myAccessOptions())
  const perms = new Set(q.data?.permissions ?? [])
  return {
    loading: q.isLoading,
    role: q.data?.role ?? null,
    roleName: q.data?.role_name ?? null,
    active: q.data?.is_active ?? false,
    can: (p: Permission | null | undefined) => !p || perms.has(p),
  }
}
