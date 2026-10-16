import { cn } from '@/lib/cn'
import { ratingParts } from '@/lib/rating'

/** สีต่อนักวิจารณ์ — RP แดงไวน์ · WS น้ำเงิน · อื่นๆ ทอง */
export function ratingTone(code: string) {
  return code === 'RP'
    ? 'bg-brand-50 text-brand-800 ring-brand-200'
    : code === 'WS'
      ? 'bg-info-50 text-info-600 ring-info-600/25'
      : 'bg-gold-100 text-gold-700 ring-gold-500/30'
}

/** คะแนนหลายค่าเป็นชิปเรียงกัน: "100RP, 98WS" → [100 RP] [98 WS] */
export function RatingChips({ rating, wrap = true, className }: { rating: string | null | undefined; wrap?: boolean; className?: string }) {
  const parts = ratingParts(rating)
  if (!parts.length) return null
  return (
    <span className={cn('inline-flex gap-1', wrap ? 'flex-wrap' : 'flex-nowrap', className)}>
      {parts.map((p) => (
        <RatingChip key={p} rating={p} />
      ))}
    </span>
  )
}

/** คะแนนเป็นชิป: "95RP" → [95 RP] */
export function RatingChip({ rating, className }: { rating: string | null | undefined; className?: string }) {
  const m = rating ? /^(.*?)([A-Za-z]+)$/.exec(rating.trim()) : null
  if (!m) return rating ? <span>{rating}</span> : null
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 rounded-full px-2 py-px text-xs leading-5 ring-1 ring-inset',
        ratingTone(m[2].toUpperCase()),
        className,
      )}
    >
      <b className="tabular-nums">{m[1]}</b>
      <span className="text-[10px] font-semibold tracking-wide">{m[2].toUpperCase()}</span>
    </span>
  )
}
