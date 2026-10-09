const num = new Intl.NumberFormat('th-TH')
const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const fmtInt = (v: number | null | undefined) => (v == null ? '' : num.format(v))
export const fmtMoney = (v: number | null | undefined) => (v == null ? '' : money.format(v))

/** yyyy-mm-dd → dd/mm/yyyy */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** รับ dd/mm/yyyy, d/m/yy, yyyy-mm-dd, ปี พ.ศ. → yyyy-mm-dd หรือ null */
export function parseDate(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  let y: number, m: number, d: number
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) {
    ;[y, m, d] = [+match[1], +match[2], +match[3]]
  } else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) {
    ;[d, m, y] = [+match[1], +match[2], +match[3]]
    if (y < 100) y += 2000
  } else {
    return null
  }
  if (y > 2400) y -= 543 // พ.ศ.
  if (y < 1800 || y > 2200) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(m)}-${p(d)}`
}

/** "2025-2040", "2025 - 40", "2030" → { from, to } */
export function parseMaturity(input: string): { from: number | null; to: number | null } | null {
  const s = input.trim()
  if (!s) return { from: null, to: null }
  const m = s.match(/^(\d{4})\s*(?:[-–~ถึง]+\s*(\d{2,4}))?$/)
  if (!m) return null
  const from = +m[1]
  let to = m[2] ? +m[2] : null
  if (to != null && to < 100) to = Math.floor(from / 100) * 100 + to
  if (to != null && to < from) return null
  return { from, to }
}

export function fmtMaturity(from: number | null, to: number | null): string {
  if (from == null && to == null) return ''
  if (to == null) return `${from}`
  if (from == null) return `–${to}`
  return `${from}-${to}`
}

export type DrinkStatus = 'unknown' | 'young' | 'ready' | 'past'

export function drinkStatus(from: number | null, to: number | null, year = new Date().getFullYear()): DrinkStatus {
  if (from == null && to == null) return 'unknown'
  if (from != null && year < from) return 'young'
  if (to != null && year > to) return 'past'
  return 'ready'
}
