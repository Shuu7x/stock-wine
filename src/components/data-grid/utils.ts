import { fmtDate, parseDate } from '@/lib/format'
import type { CellValue, GridColumn, Selection, SortDir, SortState } from './types'

export const BLANK_LABEL = '(ว่าง)'

export function getValue<R>(col: GridColumn<R>, row: R): CellValue {
  if (col.get) return col.get(row)
  const v = (row as Record<string, unknown>)[col.key]
  return v == null ? null : (v as CellValue)
}

export function setValue<R>(col: GridColumn<R>, row: R, value: CellValue): R {
  if (col.set) return col.set(row, value)
  return { ...row, [col.key]: value }
}

export function formatValue<R>(col: GridColumn<R>, row: R): string {
  const v = getValue(col, row)
  if (col.format) return col.format(v, row)
  if (v == null) return ''
  if (col.type === 'date') return fmtDate(String(v))
  return String(v)
}

/** ค่าที่ใช้กรองในหัวคอลัมน์ (ว่าง = BLANK_LABEL) */
export function filterText<R>(col: GridColumn<R>, row: R): string {
  return (col.filterValue ? col.filterValue(row) : formatValue(col, row)) || BLANK_LABEL
}

export function isReadOnly<R>(col: GridColumn<R>, row: R): boolean {
  return typeof col.readOnly === 'function' ? col.readOnly(row) : !!col.readOnly
}

export function getOptions<R>(col: GridColumn<R>, row: R): string[] {
  if (!col.options) return []
  return typeof col.options === 'function' ? col.options(row) : col.options
}

/** ข้อความ → ค่า ตาม type ของคอลัมน์ · undefined = ไม่ถูกต้อง */
export function parseText<R>(col: GridColumn<R>, text: string, row: R): CellValue | undefined {
  if (col.parse) return col.parse(text, row)
  const s = text.trim()
  if (s === '') return null
  switch (col.type) {
    case 'number': {
      const n = Number(s.replace(/[,\s฿]/g, ''))
      return Number.isFinite(n) ? n : undefined
    }
    case 'date':
      return parseDate(s) ?? undefined
    case 'select': {
      const opts = getOptions(col, row)
      return opts.find((o) => o.toLowerCase() === s.toLowerCase()) ?? undefined
    }
    default:
      return s
  }
}

export function normRange(sel: Selection) {
  return {
    top: Math.min(sel.anchor.r, sel.focus.r),
    bottom: Math.max(sel.anchor.r, sel.focus.r),
    left: Math.min(sel.anchor.c, sel.focus.c),
    right: Math.max(sel.anchor.c, sel.focus.c),
  }
}

/** แยกข้อความ TSV จาก Excel/Sheets (รองรับ "ค่าที่มี\tแท็บหรือขึ้นบรรทัด") */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"' && cell === '') {
      inQuotes = true
    } else if (ch === '\t') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function toTsv(matrix: string[][]): string {
  return matrix
    .map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t'))
    .join('\n')
}

/** ค่าที่จะเติมเมื่อลากที่มุม: ตัวเลขที่เป็นลำดับเลขคณิต (≥2 ค่า) ต่อเป็นลำดับ นอกนั้นวนซ้ำ */
export function fillSeries(source: CellValue[], count: number, forward: boolean): CellValue[] {
  const nums = source.every((v) => typeof v === 'number') && source.length >= 2
  let step: number | null = null
  if (nums) {
    const n = source as number[]
    const d = n[1] - n[0]
    if (n.every((v, i) => i === 0 || v - n[i - 1] === d)) step = d
  }
  const out: CellValue[] = []
  for (let i = 0; i < count; i++) {
    if (step != null) {
      const n = source as number[]
      out.push(forward ? n[n.length - 1] + step * (i + 1) : n[0] - step * (i + 1))
    } else {
      const len = source.length
      out.push(forward ? source[i % len] : source[len - 1 - (i % len)])
    }
  }
  // ย้อนขึ้น: out[0] คือเซลล์ที่อยู่ติดขอบบนของต้นฉบับ
  return out
}

/** ค้นแบบหลายคำ: ทุกคำที่พิมพ์ต้องอยู่ในข้อความ ("room 2" เจอ "Showroom Wines 2") */
export function matchesWords(text: string, query: string): boolean {
  const t = text.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w))
}

/** ตัวเปรียบเทียบแถวตามการเรียงหลายระดับ · ค่าว่างอยู่ท้ายเสมอ */
export function sortComparator<R>(columns: GridColumn<R>[], sort: SortState): ((a: R, b: R) => number) | null {
  const levels = sort.flatMap((s) => {
    const col = columns.find((c) => c.key === s.key)
    return col ? [{ col, mul: s.dir === 'asc' ? 1 : -1 }] : []
  })
  if (!levels.length) return null
  return (a, b) => {
    for (const { col, mul } of levels) {
      const av = getValue(col, a)
      const bv = getValue(col, b)
      let d: number
      if (av == null || av === '') d = bv == null || bv === '' ? 0 : 1
      else if (bv == null || bv === '') d = -1
      else if (typeof av === 'number' && typeof bv === 'number') d = (av - bv) * mul
      else d = formatValue(col, a).localeCompare(formatValue(col, b), 'th', { numeric: true }) * mul
      if (d) return d
    }
    return 0
  }
}

/** เลือกเรียงคอลัมน์: ยังไม่มี = ต่อท้ายเป็นระดับถัดไป · มีแล้ว = เปลี่ยนทิศ · null = เอาออก */
export function toggleSort(sort: SortState, key: string, dir: SortDir | null): SortState {
  if (!dir) return sort.filter((s) => s.key !== key)
  return sort.some((s) => s.key === key) ? sort.map((s) => (s.key === key ? { key, dir } : s)) : [...sort, { key, dir }]
}

/** ช่วงปีครอบคลุมปีที่ค้นหาไหม · ไม่มีปีเริ่ม/ปีจบ = เปิดด้านนั้น · ไม่มีทั้งคู่ = ไม่ตรง */
export function inYearRange(r: { from: number | null; to: number | null }, year: number): boolean {
  if (r.from == null && r.to == null) return false
  return (r.from == null || year >= r.from) && (r.to == null || year <= r.to)
}

/** ข้อความเป็นปี ค.ศ. 4 หลักไหม (1800–2200) */
export function asYear(text: string): number | null {
  const s = text.trim()
  if (!/^\d{4}$/.test(s)) return null
  const y = Number(s)
  return y >= 1800 && y <= 2200 ? y : null
}
