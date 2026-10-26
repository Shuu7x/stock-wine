import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

/** แท็บแบบปุ่ม เลื่อนแนวนอนได้บนมือถือ */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
  wrap,
}: {
  value: T
  onChange: (v: T) => void
  items: Array<{ value: T; label: string; count?: string }>
  className?: string
  /** แท็บเยอะ: จอกว้างขึ้นบรรทัดใหม่ให้เห็นครบ (มือถือยังเลื่อนแนวนอน) */
  wrap?: boolean
}) {
  // แท็บที่เลือกอยู่นอกจอ (มือถือ แท็บเยอะ) → เลื่อนแถบให้เห็น
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    const box = list.current?.parentElement
    if (!el || !box || box.scrollWidth <= box.clientWidth) return
    const l = el.offsetLeft - box.offsetLeft
    if (l < box.scrollLeft || l + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: l - 16 })
  }, [value])

  return (
    <div className={cn('no-scrollbar -mx-4 overflow-x-auto overflow-y-hidden px-4 sm:mx-0 sm:px-0', className)}>
      <div ref={list} role="tablist" className={cn('inline-flex gap-1.5', wrap && 'sm:flex-wrap')}>
        {items.map((it) => (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={value === it.value}
            onClick={() => onChange(it.value)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
              value === it.value
                ? 'bg-brand-700 text-white shadow-sm'
                : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-100 hover:ring-brand-300',
            )}
          >
            {it.label}
            {it.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  value === it.value ? 'bg-white/20 text-white' : 'bg-white text-brand-700',
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
