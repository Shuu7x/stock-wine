import { cn } from '@/lib/cn'

/** แท็บแบบปุ่ม เลื่อนแนวนอนได้บนมือถือ */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T
  onChange: (v: T) => void
  items: Array<{ value: T; label: string; count?: string }>
  className?: string
}) {
  return (
    <div className={cn('no-scrollbar -mx-4 overflow-x-auto overflow-y-hidden px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" className="inline-flex gap-1 rounded-xl bg-surface-3 p-1">
        {items.map((it) => (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={value === it.value}
            onClick={() => onChange(it.value)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
              value === it.value ? 'bg-surface text-brand-800 shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {it.label}
            {it.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  value === it.value ? 'bg-brand-100 text-brand-800' : 'bg-surface text-muted',
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
