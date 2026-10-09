import { Link, useNavigate, type LinkProps } from '@tanstack/react-router'
import {
  GlassWater,
  History,
  LogOut,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings,
  Warehouse,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { signOut, useSessionEmail } from '@/features/auth/api/auth.api'
import { env } from '@/lib/env'
import { queryClient } from '@/lib/query-client'

const NAV = [
  { to: '/stock', label: 'สต็อกไวน์', short: 'สต็อก', icon: Warehouse },
  { to: '/receive', label: 'รับเข้า', short: 'รับเข้า', icon: PackagePlus },
  { to: '/withdraw', label: 'เบิก', short: 'เบิก', icon: GlassWater },
  { to: '/history', label: 'ประวัติ', short: 'ประวัติ', icon: History },
] as const

const COLLAPSE_KEY = 'stock-wine:sidebar-collapsed'

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** ชื่อเมนูลอยข้างไอคอน ตอน sidebar ย่ออยู่ */
function Tip({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  )
}

function SideLink({
  to,
  label,
  icon: Icon,
  collapsed,
  className,
}: {
  to: LinkProps['to']
  label: string
  icon: LucideIcon
  collapsed: boolean
  className?: string
}) {
  return (
    <Link
      to={to}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-brand-200 transition hover:bg-brand-800 hover:text-white',
        collapsed ? 'justify-center px-0' : 'px-3',
        className,
      )}
      activeProps={{ className: '!bg-brand-700 !text-white shadow-sm' }}
    >
      <Icon className="size-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      <Tip show={collapsed}>{label}</Tip>
    </Link>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const email = useSessionEmail()
  // จำว่าย่อเมนูไว้หรือไม่ (ต่อเครื่อง)
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* ไม่จำ */
      }
      return !c
    })
  }
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
      {/* sidebar (desktop) ย่อ/ขยายได้ */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col bg-brand-900 text-brand-100 transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[72px]' : 'w-60',
        )}
      >
        <div className={cn('flex items-center gap-3 py-5', collapsed ? 'justify-center px-0' : 'px-5')}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-gold-100 shadow-inner">
            <Wine className="size-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate font-display text-lg leading-tight font-bold text-white">Wine Cellar</div>
              <div className="truncate text-xs text-brand-300">ระบบสต็อกไวน์</div>
            </div>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((n) => (
            <SideLink key={n.to} to={n.to} label={n.label} icon={n.icon} collapsed={collapsed} />
          ))}
          <SideLink to="/settings" label="ตั้งค่า" icon={Settings} collapsed={collapsed} className="mt-auto" />
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
            aria-expanded={!collapsed}
            className={cn(
              'group relative mb-2 flex items-center gap-3 rounded-lg py-2.5 text-sm text-brand-300 transition hover:bg-brand-800 hover:text-white',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px] shrink-0" /> : <PanelLeftClose className="size-[18px] shrink-0" />}
            {!collapsed && 'ย่อเมนู'}
            <Tip show={collapsed}>ขยายเมนู</Tip>
          </button>
        </nav>
        <div className="border-t border-brand-800 px-3 py-3 text-xs">
          {env.VITE_ENABLE_MOCK && (
            <button
              type="button"
              onClick={resetMock}
              aria-label={collapsed ? 'รีเซ็ตข้อมูลทดลอง' : undefined}
              className={cn(
                'group relative mb-2 flex w-full items-center gap-2 rounded-lg py-2 text-brand-300 hover:bg-brand-800 hover:text-white',
                collapsed ? 'justify-center px-0' : 'px-3',
              )}
            >
              <RotateCcw className="size-4 shrink-0" />
              {!collapsed && 'รีเซ็ตข้อมูลทดลอง'}
              <Tip show={collapsed}>รีเซ็ตข้อมูลทดลอง</Tip>
            </button>
          )}
          {!collapsed && <div className="truncate px-3 text-brand-300">{email}</div>}
          <button
            type="button"
            onClick={logout}
            aria-label={collapsed ? 'ออกจากระบบ' : undefined}
            className={cn(
              'group relative mt-1 flex w-full items-center gap-2 rounded-lg py-2 text-brand-200 hover:bg-brand-800 hover:text-white',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            <LogOut className="size-4 shrink-0" />
            {!collapsed && 'ออกจากระบบ'}
            <Tip show={collapsed}>{`ออกจากระบบ (${email ?? ''})`}</Tip>
          </button>
        </div>
      </aside>

      {/* top bar (mobile/tablet) */}
      <header className="flex shrink-0 items-center gap-3 bg-brand-900 px-4 py-3 text-white lg:hidden">
        <Wine className="size-5 text-gold-100" />
        <span className="font-display text-lg font-bold">Wine Cellar</span>
        <Link
          to="/settings"
          className="ml-auto rounded-lg p-1.5 text-brand-200 hover:bg-brand-800"
          activeProps={{ className: '!bg-brand-700 !text-white' }}
          aria-label="ตั้งค่า"
        >
          <Settings className="size-5" />
        </Link>
        <button type="button" onClick={logout} className="rounded-lg p-1.5 text-brand-200 hover:bg-brand-800" aria-label="ออกจากระบบ">
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
