import { Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * สวิตช์เปิด/ปิด — บอกสถานะได้ 3 ทาง: สีราง · ไอคอนบนปุ่ม (✓/✕) · ข้อความข้างสวิตช์ (states)
 * ไม่พึ่งสีอย่างเดียว ผู้ที่แยกสีไม่ออกก็ดูออก
 */
export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
  states,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  /** ข้อความสำหรับ screen reader */
  label: string
  id?: string
  disabled?: boolean
  /** ข้อความสถานะที่แสดงข้างสวิตช์ [ตอนเปิด, ตอนปิด] เช่น ['เปิดอยู่', 'ปิดอยู่'] */
  states?: [on: string, off: string]
}) {
  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50',
        checked ? 'border-brand-700 bg-brand-700' : 'border-[#b9adb0] bg-surface-3',
      )}
    >
      <span
        className={cn(
          'flex size-[18px] items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200',
          checked ? 'translate-x-[21px]' : 'translate-x-[2px]',
        )}
      >
        {checked ? <Check className="size-3 text-brand-700" strokeWidth={3.5} /> : <X className="size-3 text-[#8f8386]" strokeWidth={3} />}
      </span>
    </button>
  )
  if (!states) return toggle
  return (
    <span className="inline-flex items-center gap-2.5">
      {toggle}
      <span aria-hidden className={cn('text-sm font-medium', checked ? 'text-brand-700' : 'text-muted')}>
        {checked ? states[0] : states[1]}
      </span>
    </span>
  )
}
