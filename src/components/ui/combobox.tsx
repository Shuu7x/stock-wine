import { Check, ChevronDown, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Floating } from '@/components/data-grid/floating'
import { matchesWords } from '@/components/data-grid/utils'
import { cn } from '@/lib/cn'

export type ComboOption<V> = { value: V; label: string; hint?: string }

/** ช่องเลือกแบบพิมพ์ค้นหาได้ */
export function Combobox<V extends string | number>({
  value,
  onChange,
  options,
  placeholder = 'เลือก…',
  className,
}: {
  value: V | null
  onChange: (v: V) => void
  options: ComboOption<V>[]
  placeholder?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)

  const current = options.find((o) => o.value === value)
  const list = useMemo(() => {
    return q.trim() ? options.filter((o) => matchesWords(`${o.label} ${o.hint ?? ''}`, q)) : options
  }, [q, options])

  function pick(o: ComboOption<V>) {
    onChange(o.value)
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
  }

  function openList() {
    setOpen(true)
    setQ('')
    setHi(Math.max(0, options.findIndex((o) => o.value === value)))
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted transition',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        value={open ? q : (current?.label ?? '')}
        placeholder={open ? (current?.label ?? 'พิมพ์เพื่อค้นหา…') : placeholder}
        onFocus={openList}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQ(e.target.value)
          setHi(0)
          setOpen(true)
        }}
        onBlur={() => {
          setOpen(false)
          setQ('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) openList()
            else setHi((h) => Math.min(h + 1, list.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (open && list[hi]) pick(list[hi])
          } else if (e.key === 'Escape') {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
        className={cn(
          'h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface pr-9 text-sm outline-none transition placeholder:text-muted focus:cursor-text focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20',
          open ? 'pl-9' : 'pl-3',
          !open && current && 'placeholder:text-ink',
        )}
      />
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted transition',
          open && 'rotate-180',
        )}
      />
      {open && (
        <Floating anchor={ref} keepFocus maxHeight={300} className="overflow-auto rounded-lg border border-line bg-surface py-1 shadow-xl">
          <ul role="listbox">
            {list.map((o, i) => (
              <li key={String(o.value)} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                    i === hi ? 'bg-brand-50 text-brand-900' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                  {o.value === value && <Check className="size-4 text-brand-700" />}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-3 text-center text-sm text-muted">ไม่พบ “{q}”</li>}
          </ul>
        </Floating>
      )}
    </div>
  )
}
