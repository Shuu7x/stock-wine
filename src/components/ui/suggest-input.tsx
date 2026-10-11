import { History } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Floating } from '@/components/data-grid/floating'
import { matchesWords } from '@/components/data-grid/utils'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/cn'

export type Suggestion = { value: string; hint?: string }

/** ช่องพิมพ์อิสระ + รายการแนะนำ (เช่น ลูกค้าประจำ) · พิมพ์ชื่อใหม่ได้เสมอ */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  title = 'ใช้ล่าสุด',
  limit = 8,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: Suggestion[]
  placeholder?: string
  title?: string
  limit?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)

  const list = useMemo(() => {
    const q = value.trim()
    const hits = q ? suggestions.filter((s) => matchesWords(s.value, q) && s.value !== q) : suggestions
    return hits.slice(0, limit)
  }, [value, suggestions, limit])
  const show = open && list.length > 0

  function pick(s: Suggestion) {
    onChange(s.value)
    setOpen(false)
    setHi(-1)
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHi(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setHi((h) => Math.min(h + 1, list.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(h - 1, -1))
          } else if (e.key === 'Enter' && show && hi >= 0) {
            e.preventDefault()
            pick(list[hi])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {show && (
        <Floating anchor={ref} keepFocus width={360} maxHeight={320} className="overflow-auto rounded-lg border border-line bg-surface py-1 shadow-xl">
          {!value.trim() && (
            <div className="flex items-center gap-1.5 px-3 pt-1 pb-1.5 text-xs text-muted">
              <History className="size-3.5" /> {title}
            </div>
          )}
          <ul role="listbox">
            {list.map((s, i) => (
              <li key={s.value} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(s)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                    i === hi ? 'bg-brand-50 text-brand-900' : 'hover:bg-surface-2',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{s.value}</span>
                  {s.hint && <span className="shrink-0 text-xs text-muted">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Floating>
      )}
    </div>
  )
}
