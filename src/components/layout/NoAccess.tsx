import { Link } from '@tanstack/react-router'
import { ShieldOff } from 'lucide-react'
import { useAccess } from '@/lib/permissions'

export function NoAccess() {
  const { roleName } = useAccess()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        <ShieldOff className="size-7" />
      </span>
      <h1 className="font-display text-2xl font-bold text-brand-900">ไม่มีสิทธิ์เปิดหน้านี้</h1>
      <p className="max-w-sm text-sm text-muted">
        บทบาท{roleName ? ` "${roleName}" ` : 'ของคุณ'}ไม่มีสิทธิ์ใช้งานส่วนนี้ — ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เพิ่ม
      </p>
      <Link to="/stock" className="text-sm font-medium text-brand-700 underline">
        กลับไปหน้าสต็อก
      </Link>
    </div>
  )
}
