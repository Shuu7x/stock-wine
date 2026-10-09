import { CalendarDays } from 'lucide-react'
import { useRef, useState } from 'react'
import { Floating } from '@/components/data-grid/floating'
import { cn } from '@/lib/cn'
import { fmtDate, parseDate } from '@/lib/format'
import { Calendar } from './calendar'

/** ช่องวันที่ในฟอร์ม: พิมพ์ วว/ดด/ปปปป ได้ หรือเลือกจากปฏิทิน · ค่าเป็น yyyy-mm-dd */
export function DateInput({
  value,
  onChange,
  max,
  className,
}: {
  value: string
  onChange: (iso: string) => void
  max?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)

  function commit() {
    if (text == null) return
    const v = parseDate(text)
    if (v && (!max || v <= max)) onChange(v)
    setText(null)
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <input
        value={text ?? fmtDate(value)}
        placeholder="วว/ดด/ปปปป"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          commit()
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            setOpen(false)
          }
          if (e.key === 'Escape') {
            setText(null)
            setOpen(false)
          }
        }}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-9 pl-3 text-sm tabular-nums outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
      />
      <CalendarDays className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
      {open && (
        <Floating anchor={ref} keepFocus width={272} maxHeight={360} className="rounded-xl border border-line bg-surface shadow-2xl">
          <Calendar
            value={(text != null ? parseDate(text) : null) ?? value}
            max={max}
            onSelect={(v) => {
              onChange(v)
              setText(null)
              setOpen(false)
            }}
          />
        </Floating>
      )}
    </div>
  )
}
