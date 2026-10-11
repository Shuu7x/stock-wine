import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type FilterChip = {
  key: string
  /** หัวข้อ เช่น "Country" "ค้นหา" "เรียง" */
  label: ReactNode
  /** ค่าที่กรองอยู่ เช่น "France, Italy" */
  value: ReactNode
  onRemove: () => void
}

/** ชิปแสดงการกรอง/เรียงที่ใช้อยู่ · กด × เพื่อยกเลิกทีละอัน หรือ "ล้างทั้งหมด" */
export function FilterChips({ chips, onClearAll, className }: { chips: FilterChip[]; onClearAll?: () => void; className?: string }) {
  if (!chips.length) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="ตัวกรองที่ใช้อยู่">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-0.5 pr-0.5 pl-2.5 text-xs text-brand-900 ring-1 ring-brand-200 ring-inset"
        >
          <span className="shrink-0 text-brand-700">{c.label}:</span>
          <span className="min-w-0 truncate font-semibold">{c.value}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label="ยกเลิกตัวกรองนี้"
            title="ยกเลิกตัวกรองนี้"
            className="flex size-5 shrink-0 items-center justify-center rounded-full text-brand-700 transition hover:bg-brand-700 hover:text-white"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {onClearAll && chips.length > 1 && (
        <button type="button" onClick={onClearAll} className="px-1.5 text-xs font-medium text-brand-700 hover:underline">
          ล้างทั้งหมด
        </button>
      )}
    </div>
  )
}

/** รายการค่าที่เลือกแบบสั้น: "A, B, C +2" · เลือกเกินครึ่ง = "ทั้งหมด ยกเว้น X" */
export function pickedText(picked: string[], all: string[], max = 3): string {
  const label = (v: string) => (v === '' ? '(ว่าง)' : v)
  const short = (xs: string[]) => xs.slice(0, max).map(label).join(', ') + (xs.length > max ? ` +${xs.length - max}` : '')
  if (!picked.length) return 'ไม่มีค่าที่เลือก'
  const set = new Set(picked)
  const excluded = all.filter((v) => !set.has(v))
  return excluded.length && excluded.length < picked.length ? `ยกเว้น ${short(excluded)}` : short(picked)
}
