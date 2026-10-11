import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** ตัวเลขย่อสำหรับแกนกราฟ: 1,200 → 1.2K · 1,500,000 → 1.5M */
export function compact(n: number) {
  if (Math.abs(n) >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `${+(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

/** ขั้นแกนที่อ่านง่าย (1, 2, 5 × 10^n) */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

export type BarDatum = { key: string; label: string; value: number; tip: ReactNode }

/** กราฟแท่งแนวตั้ง (div ล้วน ยืดตามกล่อง) · ชี้ที่แท่งเพื่อดูรายละเอียด */
export function BarChart({ data, height = 220, emptyText = 'ยังไม่มีข้อมูลในช่วงนี้' }: { data: BarDatum[]; height?: number; emptyText?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const ticks = [1, 0.5, 0]
  // ป้ายแกนล่าง: แสดงไม่เกิน ~7 ป้าย (จอแคบก็ไม่ชนกัน)
  const every = Math.max(1, Math.ceil(data.length / 7))
  const empty = data.every((d) => d.value === 0)
  const h = hover != null ? data[hover] : null

  return (
    <div className="relative select-none" style={{ height }}>
      <div className="absolute inset-0 bottom-6 left-10">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${(1 - t) * 100}%` }}>
            <span className="absolute -top-2 -left-10 w-8 text-right text-[10px] text-muted tabular-nums">{compact(max * t)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div
              key={d.key}
              className="relative flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              onClick={() => setHover(i)}
            >
              <div
                className={cn(
                  'w-full rounded-t-[3px] transition-[height,background-color] duration-300',
                  hover === i ? 'bg-brand-600' : 'bg-brand-400/80',
                  d.value > 0 && 'min-h-[2px]',
                )}
                style={{ height: `${(d.value / max) * 100}%` }}
              />
              {i % every === 0 && (
                <span className="absolute top-full left-1/2 mt-1.5 -translate-x-1/2 text-[10px] whitespace-nowrap text-muted">{d.label}</span>
              )}
            </div>
          ))}
        </div>
        {empty && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">{emptyText}</div>}
        {h && hover != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
            style={{
              left: `${Math.min(88, Math.max(12, ((hover + 0.5) / data.length) * 100))}%`,
              top: `${Math.max(14, (1 - h.value / max) * 100)}%`,
              marginTop: -6,
            }}
          >
            {h.tip}
          </div>
        )}
      </div>
    </div>
  )
}

/** รายการแถบแนวนอน: ป้าย · แถบ · ค่า */
export function BarList({
  rows,
  empty = 'ไม่มีข้อมูล',
}: {
  rows: Array<{ key: string; label: ReactNode; value: number; display: ReactNode; sub?: ReactNode; tone?: string }>
  empty?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <div className="py-8 text-center text-sm text-muted">{empty}</div>
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{r.display}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className={cn('h-full rounded-full transition-[width] duration-500', r.tone ?? 'bg-brand-500')} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <div className="mt-0.5 truncate text-xs text-muted">{r.sub}</div>}
        </li>
      ))}
    </ul>
  )
}

/** แถบสัดส่วนเดียว (เช่น ขวดตามประเทศ) พร้อมคำอธิบายสี */
export function StackBar({ parts }: { parts: Array<{ key: string; label: string; value: number; color: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (!total) return <div className="py-8 text-center text-sm text-muted">ไม่มีข้อมูล</div>
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
        {parts.map((p) => (
          <div key={p.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label} ${p.value}`} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.key} className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            <span className="text-xs text-muted tabular-nums">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
