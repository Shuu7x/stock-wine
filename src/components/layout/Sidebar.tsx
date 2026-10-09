import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, type LinkProps } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
  GlassWater,
  History,
  PackagePlus,
  Settings,
  Warehouse,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { stockItemsOptions, storesOptions } from '@/features/stock/api/stock.api'
import { cn } from '@/lib/cn'
import { UserMenu } from './UserMenu'

/** ชื่อเมนูลอยข้างไอคอน ตอน sidebar ย่ออยู่ */
function Tip({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 -translate-y-1/2 rounded-md bg-ink px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  )
}

function NavItem({
  to,
  label,
  hint,
  icon: Icon,
  active,
  collapsed,
}: {
  to: LinkProps['to']
  label: string
  /** คำอธิบายสั้นใต้ชื่อเมนู */
  hint?: string
  icon: LucideIcon
  active: boolean
  collapsed: boolean
}) {
  return (
    <Link
      to={to}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition',
        collapsed ? 'justify-center px-0' : 'px-3',
        active ? 'bg-brand-800 text-white' : 'text-brand-200 hover:bg-brand-800/60 hover:text-white',
      )}
    >
      {active && <span className="absolute top-1/2 left-0 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold-500" />}
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md transition',
          active ? 'bg-brand-700 text-gold-100' : 'text-brand-300 group-hover:text-white',
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      {!collapsed && (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate">{label}</span>
          {hint && <span className="block truncate text-[11px] font-normal text-brand-300">{hint}</span>}
        </span>
      )}
      <Tip show={collapsed}>{label}</Tip>
    </Link>
  )
}

function Section({ title, collapsed, children }: { title: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {collapsed ? (
        <div className="mx-auto my-2 h-px w-8 bg-brand-800" aria-hidden />
      ) : (
        <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-brand-400 uppercase">{title}</div>
      )}
      {children}
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname, search } = useLocation()
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const currentStore = pathname.startsWith('/stock') ? ((search as { store?: string }).store ?? 'all') : null

  // จำนวนรายการที่มีของ ต่อคลัง
  const counts = useMemo(() => {
    const m = new Map<number, number>()
    let all = 0
    for (const i of itemsQ.data ?? []) {
      if (i.deleted_at || i.balance <= 0) continue
      m.set(i.store_id, (m.get(i.store_id) ?? 0) + 1)
      all++
    }
    return { m, all }
  }, [itemsQ.data])

  const storeLinks = [
    { code: 'all', name: 'ทุกคลัง', count: counts.all },
    ...(storesQ.data ?? []).filter((s) => s.is_active).map((s) => ({ code: s.code, name: s.name, count: counts.m.get(s.id) ?? 0 })),
  ]

  const is = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

  return (
    <aside
      className={cn(
        'relative z-20 hidden shrink-0 flex-col bg-brand-900 text-brand-100 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      {/* หัว: โลโก้แสดงตลอด (ย่อแล้วเหลือไอคอน) */}
      <div className={cn('flex h-16 shrink-0 items-center border-b border-brand-800', collapsed ? 'justify-center' : 'px-4')}>
        <Link
          to="/stock"
          aria-label="Wine Cellar — กลับหน้าสต็อก"
          title={collapsed ? 'Wine Cellar' : undefined}
          className="flex min-w-0 items-center gap-3"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-gold-100 shadow-inner">
            <Wine className="size-5" />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate font-display text-lg leading-tight font-bold text-white">Wine Cellar</span>
              <span className="block truncate text-[11px] text-brand-300">ระบบสต็อกไวน์</span>
            </span>
          )}
        </Link>
      </div>

      {/* ปุ่มย่อ/ขยาย: ปุ่มกลมคร่อมขอบขวา ไม่แย่งที่โลโก้ */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        aria-expanded={!collapsed}
        title={`${collapsed ? 'ขยายเมนู' : 'ย่อเมนู'} (Ctrl+B)`}
        className="absolute top-[20px] -right-3 z-30 flex size-6 items-center justify-center rounded-full border border-brand-700 bg-brand-900 text-brand-200 shadow-md transition hover:scale-110 hover:bg-brand-700 hover:text-white focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:outline-none"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>

      {/* ย่ออยู่: ไม่ตั้ง overflow ไม่งั้นชื่อเมนูที่ลอยออกไปทางขวาจะถูกตัด */}
      <nav
        className={cn('flex flex-1 flex-col pb-3', collapsed ? 'px-2.5' : 'overflow-y-auto px-3')}
        aria-label="เมนูหลัก"
      >
        <Section title="คลังไวน์" collapsed={collapsed}>
          <NavItem to="/stock" label="สต็อกไวน์" icon={Warehouse} active={is('/stock')} collapsed={collapsed} />
          {/* ทางลัดไปแต่ละคลัง */}
          {!collapsed && (
            <div className="ml-7 flex flex-col gap-0.5 border-l border-brand-800 py-1 pl-3">
              {storeLinks.map((s) => {
                const active = currentStore === s.code
                return (
                  <Link
                    key={s.code}
                    to="/stock"
                    search={{ store: s.code }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition',
                      active ? 'bg-brand-800 font-medium text-white' : 'text-brand-300 hover:bg-brand-800/60 hover:text-white',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-[11px] tabular-nums',
                        active ? 'bg-gold-500 text-brand-900' : 'bg-brand-800 text-brand-300',
                      )}
                    >
                      {s.count}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="ทำรายการ" collapsed={collapsed}>
          <NavItem to="/receive" label="รับเข้า" hint="รับไวน์เข้าคลัง" icon={PackagePlus} active={is('/receive')} collapsed={collapsed} />
          <NavItem to="/withdraw" label="เบิก" hint="เบิกออกไปดื่ม" icon={GlassWater} active={is('/withdraw')} collapsed={collapsed} />
        </Section>

        <Section title="รายงาน" collapsed={collapsed}>
          <NavItem to="/history" label="ประวัติ" hint="เอกสารและการแก้ไข" icon={History} active={is('/history')} collapsed={collapsed} />
        </Section>

        <Section title="ระบบ" collapsed={collapsed}>
          <NavItem to="/settings" label="ตั้งค่า" icon={Settings} active={is('/settings')} collapsed={collapsed} />
        </Section>
      </nav>

      <div className={cn('shrink-0 border-t border-brand-800 py-3', collapsed ? 'px-2.5' : 'px-3')}>
        <UserMenu placement="sidebar" compact={collapsed} />
      </div>
    </aside>
  )
}
