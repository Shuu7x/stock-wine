import { Link, useLocation } from '@tanstack/react-router'
import { Loader2, RotateCcw, Save, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../registry'

/** หน้าตั้งค่า: จอใหญ่มีเมนูซ้าย · มือถือมีแถบเมนูแนวนอนเลื่อนได้ */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const current = SETTINGS_SECTIONS.find((s) => s.to && pathname.startsWith(s.to))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        {current && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-gold-100">
            <current.icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted">ตั้งค่า</div>
          <h1 className="font-display text-2xl leading-tight font-bold text-brand-900">{current?.label ?? 'ตั้งค่า'}</h1>
          {current && <p className="text-sm text-muted">{current.description}</p>}
        </div>
      </div>

      {/* มือถือ/แท็บเล็ต: เมนูแนวนอน */}
      <nav className="-mx-4 overflow-x-auto px-4 lg:hidden" aria-label="เมนูตั้งค่า">
        <div className="flex w-max gap-1 rounded-xl bg-surface-3 p-1">
          {SETTINGS_SECTIONS.filter((s) => s.to).map((s) => {
            const active = s.id === current?.id
            return (
              <Link
                key={s.id}
                to={s.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
                  active ? 'bg-surface text-brand-800 shadow-sm' : 'text-ink-2 hover:text-ink',
                )}
              >
                <s.icon className="size-4" />
                {s.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="flex items-start gap-6">
        {/* จอใหญ่: เมนูซ้าย */}
        <nav className="sticky top-0 hidden w-60 shrink-0 lg:block" aria-label="เมนูตั้งค่า">
          {SETTINGS_GROUPS.map((group, gi) => (
            <div key={group} className={cn(gi > 0 && 'mt-4')}>
              <div className="px-3 pb-1 text-[11px] font-medium text-muted">{group}</div>
              {SETTINGS_SECTIONS.filter((s) => s.group === group).map((s) => {
                const active = s.id === current?.id
                return s.to ? (
                  <Link
                    key={s.id}
                    to={s.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                      active ? 'bg-surface font-semibold text-brand-800 shadow-sm ring-1 ring-line' : 'text-ink-2 hover:bg-surface/60 hover:text-ink',
                    )}
                  >
                    {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-brand-700" />}
                    <s.icon className={cn('size-4 shrink-0', active ? 'text-brand-700' : 'text-muted')} />
                    {s.label}
                  </Link>
                ) : (
                  <span key={s.id} title={s.description} className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted/70">
                    <s.icon className="size-4 shrink-0" />
                    {s.label}
                    <Badge className="ml-auto">เร็วๆ นี้</Badge>
                  </span>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="min-w-0 flex-1 pb-4">{children}</div>
      </div>
    </div>
  )
}

/** กล่องหัวข้อในหน้าตั้งค่า */
export function SettingsCard({
  title,
  description,
  icon,
  children,
  footer,
  className,
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const Icon = icon
  return (
    <section className={cn('overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <header className="flex items-start gap-3 px-5 pt-4 pb-3">
        {Icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Icon className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </header>
      <div className="divide-y divide-line border-t border-line">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</footer>}
    </section>
  )
}

/** หนึ่งแถวตั้งค่า: คำอธิบายซ้าย ตัวควบคุมขวา (มือถือเรียงลงมา) */
export function SettingRow({
  label,
  description,
  children,
  htmlFor,
}: {
  label: string
  description?: ReactNode
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      <div className="shrink-0 sm:w-72">{children}</div>
    </div>
  )
}

/** แถบบันทึกลอยด้านล่าง แสดงเฉพาะเมื่อมีการแก้ไข */
export function SaveBar({
  dirty,
  saving,
  onReset,
  label = 'บันทึกการตั้งค่า',
}: {
  dirty: boolean
  saving: boolean
  onReset: () => void
  label?: string
}) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 transition-all duration-200',
        dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
      aria-hidden={!dirty}
    >
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-surface px-4 py-3 shadow-xl">
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <span className="size-2 rounded-full bg-warning-600" />
          มีการเปลี่ยนแปลงที่ยังไม่บันทึก
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onReset} disabled={saving}>
            <RotateCcw className="size-4" /> ยกเลิก
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {label}
          </Button>
        </div>
      </div>
    </div>
  )
}
