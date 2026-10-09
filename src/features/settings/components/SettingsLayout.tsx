import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page'
import { cn } from '@/lib/cn'
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from '../registry'

export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ตั้งค่า" description="ตั้งค่าระบบ ข้อมูลหลัก และบัญชีผู้ใช้" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        {/* มือถือ: แถบเลื่อนแนวนอน · จอใหญ่: เมนูด้านซ้าย */}
        <nav className="-mx-4 overflow-x-auto px-4 lg:sticky lg:top-0 lg:mx-0 lg:w-64 lg:shrink-0 lg:overflow-visible lg:px-0">
          <div className="flex gap-1 lg:flex-col lg:gap-4">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group} className="contents lg:flex lg:flex-col lg:gap-0.5">
                <div className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase lg:block">
                  {group}
                </div>
                {SETTINGS_SECTIONS.filter((s) => s.group === group).map((s) =>
                  s.to ? (
                    <Link
                      key={s.id}
                      to={s.to}
                      className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-2 transition hover:bg-surface-3"
                      activeProps={{ className: '!bg-surface !text-brand-800 shadow-sm ring-1 ring-line' }}
                    >
                      <s.icon className="size-4 shrink-0" />
                      {s.label}
                    </Link>
                  ) : (
                    <span
                      key={s.id}
                      title={s.description}
                      className="hidden shrink-0 cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted lg:flex"
                    >
                      <s.icon className="size-4 shrink-0" />
                      {s.label}
                      <Badge className="ml-auto">เร็วๆ นี้</Badge>
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

/** กล่องหัวข้อในหน้าตั้งค่า */
export function SettingsCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </header>
      <div className="divide-y divide-line">{children}</div>
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
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
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
