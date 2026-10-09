import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/** 0 = แสดงทั้งหมด */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 0] as const

/** รายการที่แบ่งหน้าฝั่ง server ไม่มีตัวเลือก 'ทั้งหมด' */
export const DOC_PAGE_SIZES = [10, 20, 50, 100] as const

/** ตัวแบ่งหน้า + เลือกจำนวนต่อหน้า */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  options = PAGE_SIZE_OPTIONS,
  unit = 'รายการ',
  className,
}: {
  page: number
  /** 0 = ทั้งหมด */
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  options?: readonly number[]
  unit?: string
  className?: string
}) {
  const pages = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1
  const from = total === 0 ? 0 : pageSize ? (page - 1) * pageSize + 1 : 1
  const to = pageSize ? Math.min(total, page * pageSize) : total
  const btn =
    'flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-surface-3 disabled:pointer-events-none disabled:opacity-30'

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted', className)}>
      <span className="tabular-nums">
        {from.toLocaleString('th-TH')}–{to.toLocaleString('th-TH')} จาก {total.toLocaleString('th-TH')} {unit}
      </span>
      <label className="flex items-center gap-1.5">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="จำนวนต่อหน้า"
          className="h-7 rounded-md border border-line-strong bg-surface px-1.5 text-xs text-ink outline-none focus:border-brand-600"
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'ทั้งหมด' : n}
            </option>
          ))}
        </select>
        ต่อหน้า
      </label>
      {pages > 1 && (
        <span className="flex items-center gap-0.5">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(1)} aria-label="หน้าแรก">
            <ChevronsLeft className="size-4" />
          </button>
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="หน้าก่อน">
            <ChevronLeft className="size-4" />
          </button>
          <span className="flex items-center gap-1 px-1 text-ink-2">
            หน้า
            <input
              key={page}
              defaultValue={page}
              inputMode="numeric"
              aria-label="ไปหน้า"
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const n = Math.min(pages, Math.max(1, Math.floor(Number(e.currentTarget.value)) || 1))
                e.currentTarget.value = String(n)
                onPage(n)
              }}
              onBlur={(e) => (e.target.value = String(page))}
              className="h-7 w-10 rounded-md border border-line-strong bg-surface text-center text-xs text-ink tabular-nums outline-none focus:border-brand-600"
            />
            / {pages.toLocaleString('th-TH')}
          </span>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="หน้าถัดไป">
            <ChevronRight className="size-4" />
          </button>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(pages)} aria-label="หน้าสุดท้าย">
            <ChevronsRight className="size-4" />
          </button>
        </span>
      )}
    </div>
  )
}

/** จำขนาดหน้าที่ผู้ใช้เลือกไว้ในเครื่อง (ต่อหน้าจอ) */
export function loadPageSize(key: string | undefined, fallback: number): number {
  if (!key) return fallback
  try {
    const v = Number(localStorage.getItem(`stock-wine:page-size:${key}`))
    const raw = localStorage.getItem(`stock-wine:page-size:${key}`)
    return raw != null && [...PAGE_SIZE_OPTIONS, ...DOC_PAGE_SIZES].includes(v as never) ? v : fallback
  } catch {
    return fallback
  }
}

export function savePageSize(key: string | undefined, size: number) {
  if (!key) return
  try {
    localStorage.setItem(`stock-wine:page-size:${key}`, String(size))
  } catch {
    /* ไม่จำ */
  }
}
