import { cn } from '@/lib/cn'

/** สีต่อนักวิจารณ์ — RP แดงไวน์ · WS น้ำเงิน · อื่นๆ ทอง */
export function ratingTone(code: string) {
  return code === 'RP'
    ? 'bg-brand-50 text-brand-800 ring-brand-200'
    : code === 'WS'
      ? 'bg-info-50 text-info-600 ring-info-600/25'
      : 'bg-gold-100 text-gold-700 ring-gold-500/30'
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
