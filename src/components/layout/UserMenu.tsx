import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, RotateCcw, UserCog } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { signOut, useSessionEmail } from '@/features/auth/api/auth.api'
import { cn } from '@/lib/cn'
import { env } from '@/lib/env'
import { queryClient } from '@/lib/query-client'

function initials(email: string | null) {
  const name = (email ?? '?').split('@')[0]
  const parts = name.split(/[._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function Avatar({ email, className }: { email: string | null; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-500 text-sm font-semibold text-brand-900',
        className,
      )}
      aria-hidden
    >
      {initials(email)}
    </span>
  )
}

/**
 * การ์ดผู้ใช้ + เมนู (บัญชีของฉัน · รีเซ็ตข้อมูลทดลอง · ออกจากระบบ)
 * placement: 'sidebar' เปิดขึ้นด้านบน (ย่อแล้วเปิดไปทางขวา) · 'header' เปิดลงด้านล่างชิดขวา
 */
export function UserMenu({ placement, compact = false }: { placement: 'sidebar' | 'header'; compact?: boolean }) {
  const email = useSessionEmail()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

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

  const item =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-surface-3'
  const normal = cn(item, 'text-ink-2 hover:text-ink')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact || placement === 'header' ? `บัญชี ${email ?? ''}` : undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg text-left transition',
          placement === 'sidebar'
            ? cn('text-brand-100 hover:bg-brand-800', compact ? 'justify-center p-1.5' : 'p-2', open && 'bg-brand-800')
            : 'p-0.5 hover:opacity-90',
        )}
      >
        <Avatar email={email} className={placement === 'header' ? 'size-8 text-xs' : undefined} />
        {placement === 'sidebar' && !compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{email?.split('@')[0] ?? '—'}</span>
              <span className="block truncate text-xs text-brand-300">{email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-brand-300" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 w-60 rounded-xl border border-line bg-surface p-1.5 text-ink shadow-2xl',
            placement === 'header'
              ? 'top-full right-0 mt-2'
              : compact
                ? 'bottom-0 left-full ml-3'
                : 'bottom-full left-0 mb-2',
          )}
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar email={email} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{email?.split('@')[0]}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <Link to="/settings/account" role="menuitem" className={normal} onClick={() => setOpen(false)}>
            <UserCog className="size-4" /> บัญชีของฉัน
          </Link>
          {env.VITE_ENABLE_MOCK && (
            <button type="button" role="menuitem" className={normal} onClick={resetMock}>
              <RotateCcw className="size-4" /> รีเซ็ตข้อมูลทดลอง
            </button>
          )}
          <div className="my-1 border-t border-line" />
          <button type="button" role="menuitem" className={cn(item, 'text-danger-700 hover:bg-danger-50')} onClick={logout}>
            <LogOut className="size-4" /> ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  )
}
