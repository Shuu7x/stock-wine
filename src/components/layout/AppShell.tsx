import { Link, useNavigate } from '@tanstack/react-router'
import { History, LogOut, PackagePlus, GlassWater, Warehouse, Wine, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { signOut, useSessionEmail } from '@/features/auth/api/auth.api'
import { env } from '@/lib/env'
import { queryClient } from '@/lib/query-client'

const NAV = [
  { to: '/stock', label: 'สต็อกไวน์', short: 'สต็อก', icon: Warehouse },
  { to: '/receive', label: 'รับเข้า', short: 'รับเข้า', icon: PackagePlus },
  { to: '/withdraw', label: 'เบิก', short: 'เบิก', icon: GlassWater },
  { to: '/history', label: 'ประวัติ', short: 'ประวัติ', icon: History },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const email = useSessionEmail()
  const navigate = useNavigate()

  async function logout() {
    await signOut()
    queryClient.clear()
    navigate({ to: '/login' })
  }

  async function resetMock() {
    if (!confirm('รีเซ็ตข้อมูลทดลองกลับเป็นค่าเริ่มต้น?')) return
    const { resetDb } = await import('@/mocks/db')
    resetDb()
    localStorage.removeItem('stock-wine:receive-draft:v1')
    localStorage.removeItem('stock-wine:withdraw-draft:v1')
    location.reload()
  }

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      {/* sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col bg-brand-900 text-brand-100 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-700 text-gold-100 shadow-inner">
            <Wine className="size-5" />
          </div>
          <div>
            <div className="font-display text-lg leading-tight font-bold text-white">Wine Cellar</div>
            <div className="text-xs text-brand-300">ระบบสต็อกไวน์</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-200 transition hover:bg-brand-800 hover:text-white"
              activeProps={{ className: '!bg-brand-700 !text-white shadow-sm' }}
            >
              <n.icon className="size-[18px]" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-brand-800 p-3 text-xs">
          {env.VITE_ENABLE_MOCK && (
            <button
              type="button"
              onClick={resetMock}
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-brand-300 hover:bg-brand-800 hover:text-white"
            >
              <RotateCcw className="size-4" /> รีเซ็ตข้อมูลทดลอง
            </button>
          )}
          <div className="truncate px-3 text-brand-300">{email}</div>
          <button
            type="button"
            onClick={logout}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-brand-200 hover:bg-brand-800 hover:text-white"
          >
            <LogOut className="size-4" /> ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* top bar (mobile/tablet) */}
      <header className="flex shrink-0 items-center gap-3 bg-brand-900 px-4 py-3 text-white lg:hidden">
        <Wine className="size-5 text-gold-100" />
        <span className="font-display text-lg font-bold">Wine Cellar</span>
        <button type="button" onClick={logout} className="ml-auto rounded-lg p-1.5 text-brand-200 hover:bg-brand-800" aria-label="ออกจากระบบ">
          <LogOut className="size-5" />
        </button>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 lg:p-6">{children}</main>

      {/* bottom nav (mobile/tablet) */}
      <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted"
            activeProps={{ className: '!text-brand-700' }}
          >
            <n.icon className="size-5" />
            {n.short}
          </Link>
        ))}
      </nav>
    </div>
  )
}
