import { Link, useLocation } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ClipboardCheck,
  GlassWater,
  History,
  LayoutGrid,
  PackagePlus,
  QrCode,
  Settings,
  ShoppingBag,
  Warehouse,
  Wine,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'

// มือถือ: เมนูล่าง 4 อย่างที่ใช้บ่อย + "เพิ่มเติม" สำหรับที่เหลือ
const MOBILE_NAV = [
  { to: '/stock', label: 'สต็อก', icon: Warehouse },
  { to: '/receive', label: 'รับเข้า', icon: PackagePlus },
  { to: '/sale', label: 'ขาย', icon: ShoppingBag },
  { to: '/withdraw', label: 'เบิก', icon: GlassWater },
] as const

const MOBILE_MORE = [
  { to: '/transfer', label: 'โอนย้าย', icon: ArrowLeftRight },
  { to: '/adjust', label: 'ปรับยอด', icon: ClipboardCheck },
  { to: '/qr', label: 'ป้าย QR', icon: QrCode },
  { to: '/history', label: 'ประวัติ', icon: History },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
] as const

const COLLAPSE_KEY = 'stock-wine:sidebar-collapsed'

function loadCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  // จำว่าย่อเมนูไว้หรือไม่ (ต่อเครื่อง)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const inMore = MOBILE_MORE.some((m) => pathname.startsWith(m.to))
  // เปลี่ยนหน้าแล้วปิดเมนูเพิ่มเติม
  useEffect(() => setMoreOpen(false), [pathname])

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* ไม่จำ */
      }
      return !c
    })
  }

  // Ctrl+B ย่อ/ขยายเมนู
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      {/* แถบบน (มือถือ/แท็บเล็ต) */}
      <header className="flex h-14 shrink-0 items-center gap-2 bg-brand-900 px-4 text-white lg:hidden">
        <Link to="/stock" className="flex items-center gap-2">
          <Wine className="size-5 text-gold-100" />
          <span className="font-display text-lg font-bold">Wine Cellar</span>
        </Link>
        <Link
          to="/settings"
          className="ml-auto flex size-9 items-center justify-center rounded-lg text-brand-200 hover:bg-brand-800"
          activeProps={{ className: '!bg-brand-700 !text-white' }}
          aria-label="ตั้งค่า"
        >
          <Settings className="size-5" />
        </Link>
        <UserMenu placement="header" />
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 lg:p-6">{children}</main>

      {/* เมนูเพิ่มเติม (มือถือ) */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-ink/30" />
          <div
            className="absolute inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] rounded-t-2xl border-t border-line bg-surface p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-semibold">เมนูเพิ่มเติม</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-1 text-muted hover:bg-surface-3" aria-label="ปิด">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MOBILE_MORE.map((m) => (
                <Link
                  key={m.to}
                  to={m.to}
                  role="menuitem"
                  className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-2 py-3 text-xs font-medium text-ink-2"
                  activeProps={{ className: '!bg-brand-50 !text-brand-800' }}
                >
                  <m.icon className="size-5" />
                  {m.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* เมนูล่าง (มือถือ/แท็บเล็ต) */}
      <nav className="relative z-50 grid shrink-0 grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted"
            activeProps={{ className: '!text-brand-700' }}
          >
            <n.icon className="size-5" />
            {n.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={cn(
            'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
            moreOpen || inMore ? 'text-brand-700' : 'text-muted',
          )}
        >
          <LayoutGrid className="size-5" />
          เพิ่มเติม
        </button>
      </nav>
    </div>
  )
}
