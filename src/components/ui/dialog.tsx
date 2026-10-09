import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl',
          size === 'md' ? 'sm:max-w-md' : 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface-3" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>}
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
