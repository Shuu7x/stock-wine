import { Link, useLocation, type LinkProps } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  GlassWater,
  History,
  PackagePlus,
  QrCode,
  Settings,
  ShoppingBag,
  Warehouse,
  Wine,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
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

const itemClass = (active: boolean, collapsed: boolean) =>
  cn(
    'group relative flex h-10 items-center gap-3 rounded-lg text-sm transition',
    collapsed ? 'justify-center' : 'px-3',
    active ? 'bg-white/10 font-semibold text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white',
  )

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  collapsed,
  trailing,
}: {
  to: LinkProps['to']
  label: string
  icon: LucideIcon
  active: boolean
  collapsed: boolean
  trailing?: ReactNode
}) {
  return (
    <Link
      to={to}
      aria-label={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={itemClass(active, collapsed)}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-gold-500" />}
      <Icon className={cn('size-[18px] shrink-0', active ? 'text-gold-100' : 'text-brand-300 group-hover:text-white')} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{trailing ? label.replace(/\s*\(.*\)$/, '') : label}</span>}
      {!collapsed && trailing}
      <Tip show={collapsed}>{label}</Tip>
    </Link>
  )
}

function Group({ title, collapsed, children }: { title?: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {title &&
        (collapsed ? (
          <div className="mx-auto my-2 h-px w-6 bg-white/10" aria-hidden />
        ) : (
          <div className="px-3 pt-5 pb-1 text-[11px] font-medium text-brand-400">{title}</div>
        ))}
      {children}
    </div>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname } = useLocation()
  const is = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

  return (
    <aside
      className={cn(
        'scroll-dark relative z-20 hidden shrink-0 flex-col bg-brand-900 text-brand-100 transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      {/* โลโก้ (ย่อแล้วเหลือไอคอน) */}
      <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
        <Link to="/stock" aria-label="Wine Cellar — กลับหน้าสต็อก" title={collapsed ? 'Wine Cellar' : undefined} className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-gold-100">
            <Wine className="size-[18px]" />
          </span>
          {!collapsed && <span className="truncate font-display text-lg font-bold text-white">Wine Cellar</span>}
        </Link>
      </div>

      {/* ปุ่มย่อ/ขยาย คร่อมขอบขวา */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        aria-expanded={!collapsed}
        title={`${collapsed ? 'ขยายเมนู' : 'ย่อเมนู'} (Ctrl+B)`}
        className="absolute top-5 -right-3 z-30 flex size-6 items-center justify-center rounded-full border border-brand-700 bg-brand-900 text-brand-200 shadow-md transition hover:bg-brand-700 hover:text-white focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:outline-none"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>

      {/* ย่ออยู่: ไม่ตั้ง overflow ไม่งั้นชื่อเมนูที่ลอยออกไปทางขวาจะถูกตัด */}
      <nav className={cn('flex flex-1 flex-col', collapsed ? 'px-3' : 'overflow-y-auto px-3')} aria-label="เมนูหลัก">
        <Group collapsed={collapsed}>
          <NavItem to="/stock" label="สต็อกไวน์" icon={Warehouse} active={is('/stock')} collapsed={collapsed} />
        </Group>

        <Group title="ทำรายการ" collapsed={collapsed}>
          <NavItem to="/withdraw" label="เบิก" icon={GlassWater} active={is('/withdraw')} collapsed={collapsed} />
          <NavItem to="/receive" label="รับเข้า" icon={PackagePlus} active={is('/receive')} collapsed={collapsed} />
          <NavItem to="/transfer" label="โอนย้าย" icon={ArrowLeftRight} active={is('/transfer')} collapsed={collapsed} />
          <NavItem to="/adjust" label="ปรับยอด" icon={ClipboardCheck} active={is('/adjust')} collapsed={collapsed} />
          <NavItem to="/sale" label="ขาย" icon={ShoppingBag} active={is('/sale')} collapsed={collapsed} />
        </Group>

        <Group title="เครื่องมือ" collapsed={collapsed}>
          <NavItem to="/history" label="ความเคลื่อนไหว" icon={History} active={is('/history')} collapsed={collapsed} />
          <NavItem to="/qr" label="ป้าย QR" icon={QrCode} active={is('/qr')} collapsed={collapsed} />
        </Group>

        <div className="mt-auto pt-4 pb-2">
          <NavItem to="/settings" label="ตั้งค่า" icon={Settings} active={is('/settings')} collapsed={collapsed} />
        </div>
      </nav>

      <div className={cn('shrink-0 border-t border-white/10 py-3', collapsed ? 'px-3' : 'px-3')}>
        <UserMenu placement="sidebar" compact={collapsed} />
      </div>
    </aside>
  )
}
