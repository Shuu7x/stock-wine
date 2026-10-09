import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { todayIso } from '@/lib/format'

const MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

function toView(v: string | null) {
  const m = v?.match(/^(\d{4})-(\d{2})/)
  return m ? { y: +m[1], m: +m[2] - 1 } : null
}

/** ปฏิทินเลือกวัน (ค่าเป็น yyyy-mm-dd) — ใช้ทั้งใน cell ของตารางและช่องวันที่ในฟอร์ม */
export function Calendar({
  value,
  onSelect,
  onClear,
  max,
}: {
  value: string | null
  onSelect: (iso: string) => void
  onClear?: () => void
  max?: string
}) {
  const today = todayIso()
  const [view, setView] = useState(() => toView(value) ?? toView(today)!)
  // ตามค่าที่พิมพ์ในช่องให้ทัน
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    const v = toView(value)
    if (v) setView(v)
  }

  const shift = (months: number) =>
    setView(({ y, m }) => {
      const t = y * 12 + m + months
      return { y: Math.floor(t / 12), m: t % 12 }
    })

  const first = new Date(view.y, view.m, 1).getDay()
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells: Array<number | null> = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)

  const navBtn = 'rounded-md p-1 text-ink-2 hover:bg-surface-3'

  return (
    <div className="w-[272px] p-3 select-none">
      <div className="mb-2 flex items-center gap-0.5">
        <button type="button" className={navBtn} onClick={() => shift(-12)} aria-label="ปีก่อน">
          <ChevronsLeft className="size-4" />
        </button>
        <button type="button" className={navBtn} onClick={() => shift(-1)} aria-label="เดือนก่อน">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex-1 text-center text-sm font-semibold">
          {MONTHS[view.m]} {view.y}
          <span className="ml-1 text-xs font-normal text-muted">(พ.ศ. {view.y + 543})</span>
        </div>
        <button type="button" className={navBtn} onClick={() => shift(1)} aria-label="เดือนถัดไป">
          <ChevronRight className="size-4" />
        </button>
        <button type="button" className={navBtn} onClick={() => shift(12)} aria-label="ปีถัดไป">
          <ChevronsRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn('py-1 text-[11px] font-medium text-muted', i === 0 && 'text-danger-600')}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />
          const v = iso(view.y, view.m, d)
          const disabled = !!max && v > max
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(v)}
              className={cn(
                'h-8 rounded-md text-sm tabular-nums transition',
                v === value
                  ? 'bg-brand-700 font-semibold text-white'
                  : v === today
                    ? 'font-semibold text-brand-700 ring-1 ring-brand-300 ring-inset hover:bg-brand-50'
                    : 'hover:bg-surface-3',
                disabled && 'cursor-not-allowed opacity-30 hover:bg-transparent',
              )}
            >
              {d}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm">
        {onClear ? (
          <button type="button" className="rounded-md px-2 py-1 text-muted hover:bg-surface-3" onClick={onClear}>
            ล้าง
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-50"
          onClick={() => onSelect(today)}
        >
          วันนี้
        </button>
      </div>
    </div>
  )
}
