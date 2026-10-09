import { Link } from '@tanstack/react-router'
import { GlassWater, History, PackagePlus, Settings, Warehouse, Wine } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { UserMenu } from './UserMenu'

const MOBILE_NAV = [
  { to: '/stock', label: 'สต็อก', icon: Warehouse },
  { to: '/receive', label: 'รับเข้า', icon: PackagePlus },
  { to: '/withdraw', label: 'เบิก', icon: GlassWater },
  { to: '/history', label: 'ประวัติ', icon: History },
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

      {/* เมนูล่าง (มือถือ/แท็บเล็ต) */}
      <nav className="grid shrink-0 grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
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
      </nav>
    </div>
  )
}
