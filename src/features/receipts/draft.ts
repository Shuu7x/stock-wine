import { z } from 'zod'
import type { WineFields } from '@/features/stock/columns'

export type ReceiveRow = WineFields & { _id: string; qty: number | null }

export function newReceiveRow(storeId: number | null): ReceiveRow {
  return {
    _id: crypto.randomUUID(),
    store_id: storeId,
    rack: null,
    country: null,
    wine_name: null,
    vintage: null,
    qty: null,
    rating_rp: null,
    rating_ws: null,
    maturity_from: null,
    maturity_to: null,
    price_per_bottle: null,
    supplier: null,
    purchase_date: null,
    remark: null,
  }
}

/** แถวว่าง = ยังไม่ได้กรอกอะไรเลย (คลังกับวันที่ซื้อมีค่าตั้งต้น จึงไม่นับ) */
export function isBlankRow(r: ReceiveRow) {
  return (
    !r.wine_name?.trim() &&
    r.qty == null &&
    !r.country &&
    !r.rack &&
    r.vintage == null &&
    r.rating_rp == null &&
    r.rating_ws == null &&
    r.maturity_from == null &&
    r.price_per_bottle == null &&
    !r.supplier &&
    !r.remark
  )
}

const lineSchema = z.object({
  store_id: z.number({ error: 'เลือกคลัง' }),
  wine_name: z.string({ error: 'ระบุชื่อไวน์' }).trim().min(1, 'ระบุชื่อไวน์'),
  qty: z.number({ error: 'ระบุจำนวนที่รับ' }).int('จำนวนต้องเป็นจำนวนเต็ม').positive('จำนวนต้องมากกว่า 0'),
})

/** คืน error ต่อคอลัมน์ (key ตรงกับ GridColumn.key) */
export function validateReceiveRow(r: ReceiveRow): Record<string, string> {
  const res = lineSchema.safeParse(r)
  const errors: Record<string, string> = {}
  if (!res.success) {
    for (const issue of res.error.issues) {
      const key = String(issue.path[0])
      errors[key] ??= issue.message
    }
  }
  return errors
}

// ร่างใบรับเข้าเก็บในเครื่อง กันข้อมูลหายเมื่อรีเฟรช/ปิดแท็บ
const DRAFT_KEY = 'stock-wine:receive-draft:v1'

export type ReceiveDraft = { rows: ReceiveRow[]; receivedAt: string; note: string; defaultStore: number | null }

export function loadReceiveDraft(): ReceiveDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as ReceiveDraft) : null
  } catch {
    return null
  }
}

export function saveReceiveDraft(d: ReceiveDraft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* โหมด private — ไม่เก็บร่าง */
  }
}
