import { CalendarRange, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Floating } from '@/components/data-grid/floating'
import { DateInput } from '@/components/ui/date-input'
import { cn } from '@/lib/cn'
import { todayIso } from '@/lib/format'

export type DateRange = { from: string; to: string }
export type DatePreset = { key: string; label: string; range: () => DateRange }

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const part = (iso: string) => ({ d: Number(iso.slice(8, 10)), m: Number(iso.slice(5, 7)) - 1, y: Number(iso.slice(0, 4)) + 543 })

/** "1 – 16 ต.ค. 2569" · ข้ามเดือน/ปีแสดงเต็มเฉพาะที่ต่างกัน */
export function rangeText({ from, to }: DateRange) {
  const a = part(from)
  const b = part(to)
  if (from === to) return `${b.d} ${TH_MONTHS[b.m]} ${b.y}`
  if (a.y === b.y && a.m === b.m) return `${a.d} – ${b.d} ${TH_MONTHS[b.m]} ${b.y}`
  if (a.y === b.y) return `${a.d} ${TH_MONTHS[a.m]} – ${b.d} ${TH_MONTHS[b.m]} ${b.y}`
  return `${a.d} ${TH_MONTHS[a.m]} ${a.y} – ${b.d} ${TH_MONTHS[b.m]} ${b.y}`
}

/** ปุ่มเลือกช่วงวันที่: แสดงช่วงที่เลือกบนปุ่ม · กดเปิดแผง ทางลัดด้านซ้าย + วันที่เริ่ม/สิ้นสุดด้านขวา */
export function DateRangeButton({
  value,
  onChange,
  presets,
  className,
}: {
  value: DateRange
  onChange: (r: DateRange) => void
  presets: readonly DatePreset[]
  className?: string
}) {
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const active = presets.find((p) => {
    const r = p.range()
    return r.from === value.from && r.to === value.to
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      // ปฏิทินของ DateInput ลอยอยู่นอกแผง (portal) — ไม่ถือว่าคลิกนอก
      if (btn.current?.contains(t) || panel.current?.contains(t) || (t as Element).closest?.('[data-floating]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 items-center gap-2 rounded-lg border bg-surface pr-2.5 pl-3 text-sm transition',
          open ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-line-strong hover:border-brand-400',
          className,
        )}
      >
        <CalendarRange className="size-4 text-brand-700" />
        <span className="font-medium tabular-nums">{rangeText(value)}</span>
        {active && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-800">{active.label}</span>}
        <ChevronDown className={cn('size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <Floating anchor={btn} width={420} maxHeight={360} className="rounded-xl border border-line bg-surface shadow-2xl">
          <div ref={panel} className="flex">
            <ul className="flex w-32 shrink-0 flex-col gap-0.5 border-r border-line p-2">
              {presets.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p.range())
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition',
                      active?.key === p.key ? 'bg-brand-700 font-medium text-white' : 'text-ink-2 hover:bg-brand-50 hover:text-brand-800',
                    )}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-1 flex-col gap-3 p-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                ตั้งแต่วันที่
                <DateInput value={value.from} max={value.to} onChange={(v) => v && onChange({ ...value, from: v })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                ถึงวันที่
                <DateInput value={value.to} max={todayIso()} onChange={(v) => v && onChange({ ...value, to: v })} />
              </label>
              <p className="text-xs text-muted">ต้องเลือกช่วงเสมอ — ดึงข้อมูลเฉพาะช่วงนี้ แนะนำทีละเดือนหรือไตรมาส</p>
            </div>
          </div>
        </Floating>
      )}
    </>
  )
}
