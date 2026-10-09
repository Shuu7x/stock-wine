import { http } from 'msw/http'
import type { Tables } from '@/lib/database.types'
import { auditNow, db, docNo, MOCK_USER, persist, PgError } from '@/mocks/db'
import { stockIdentity } from '@/mocks/handlers/stock'
import { emailOf, requireAuth, respondList, rest, rpc, withLines } from '@/mocks/postgrest'

type LineInput = {
  store_id: number
  rack: string | null
  country: string | null
  wine_name: string
  vintage: number | null
  rating_rp: number | null
  rating_ws: number | null
  maturity_from: number | null
  maturity_to: number | null
  qty: number
  price_per_bottle: number | null
  supplier: string | null
  purchase_date: string | null
  remark: string | null
}

const blank = (s: string | null | undefined) => (s ?? '').trim() || null

// เลียนแบบ public.post_receipt
function postReceipt(email: string, receivedAt: string | null, note: string | null, lines: LineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new PgError('ไม่มีรายการรับเข้า')
  lines.forEach((l, i) => {
    if (!(l.qty > 0)) throw new PgError(`แถว ${i + 1}: จำนวนรับต้องมากกว่า 0`)
    if (!l.wine_name?.trim()) throw new PgError(`แถว ${i + 1}: ต้องระบุชื่อไวน์`)
  })

  // ทำบนสำเนาก่อน ถ้าพังกลางทางจะไม่มีอะไรถูกบันทึก (เลียนแบบ transaction)
  const items = structuredClone(db.stock_items)
  const receipt: Tables<'receipts'> = {
    id: crypto.randomUUID(),
    doc_no: docNo('RC', db.seq.receipt + 1),
    received_at: receivedAt ?? new Date().toISOString().slice(0, 10),
    note: blank(note),
    status: 'posted',
    void_reason: null,
    voided_at: null,
    voided_by: null,
    created_by_email: email,
    ...auditNow(),
  }
  const newLines: Tables<'receipt_lines'>[] = []

  lines.forEach((l, i) => {
    const key = stockIdentity({ ...l, rack: blank(l.rack) })
    let item = items.find((s) => s.deleted_at == null && stockIdentity(s) === key)
    const isNew = !item
    if (!item) {
      item = {
        id: crypto.randomUUID(),
        store_id: l.store_id,
        rack: blank(l.rack),
        country: blank(l.country),
        wine_name: l.wine_name.trim(),
        vintage: l.vintage,
        rating_rp: l.rating_rp,
        rating_ws: l.rating_ws,
        maturity_from: l.maturity_from,
        maturity_to: l.maturity_to,
        price_per_bottle: l.price_per_bottle,
        supplier: blank(l.supplier),
        purchase_date: l.purchase_date,
        remark: blank(l.remark),
        balance: l.qty,
        deleted_at: null,
        deleted_by: null,
        ...auditNow(),
      }
      items.push(item)
    } else {
      item.balance += l.qty
      item.country = blank(l.country) ?? item.country
      item.rating_rp = l.rating_rp ?? item.rating_rp
      item.rating_ws = l.rating_ws ?? item.rating_ws
      item.maturity_from = l.maturity_from ?? item.maturity_from
      item.maturity_to = l.maturity_to ?? item.maturity_to
      item.price_per_bottle = l.price_per_bottle ?? item.price_per_bottle
      item.supplier = blank(l.supplier) ?? item.supplier
      item.purchase_date = l.purchase_date ?? item.purchase_date
      item.remark = blank(l.remark) ?? item.remark
      item.updated_at = new Date().toISOString()
    }
    newLines.push({
      id: crypto.randomUUID(),
      receipt_id: receipt.id,
      line_no: i + 1,
      stock_item_id: item.id,
      is_new_item: isNew,
      store_id: l.store_id,
      rack: blank(l.rack),
      country: blank(l.country),
      wine_name: l.wine_name.trim(),
      vintage: l.vintage,
      rating_rp: l.rating_rp,
      rating_ws: l.rating_ws,
      maturity_from: l.maturity_from,
      maturity_to: l.maturity_to,
      qty: l.qty,
      price_per_bottle: l.price_per_bottle,
      supplier: blank(l.supplier),
      purchase_date: l.purchase_date,
      remark: blank(l.remark),
      ...auditNow(),
    })
  })

  db.seq.receipt += 1
  db.stock_items = items
  db.receipts.push(receipt)
  db.receipt_lines.push(...newLines)
  persist()
  return receipt
}

// เลียนแบบ public.void_receipt
function voidReceipt(id: string, reason: string | null) {
  const doc = db.receipts.find((r) => r.id === id)
  if (!doc) throw new PgError('ไม่พบเอกสาร')
  if (doc.status === 'void') throw new PgError('เอกสารนี้ถูกยกเลิกแล้ว')
  const lines = db.receipt_lines.filter((l) => l.receipt_id === id)
  const need = new Map<string, number>()
  for (const l of lines) need.set(l.stock_item_id, (need.get(l.stock_item_id) ?? 0) + l.qty)
  for (const [itemId, qty] of need) {
    const item = db.stock_items.find((s) => s.id === itemId)!
    if (item.balance < qty) {
      throw new PgError(
        `ยกเลิกไม่ได้: ${item.wine_name} คงเหลือ ${item.balance} ขวด น้อยกว่าที่รับเข้า ${qty} ขวด (ถูกเบิกไปแล้ว)`,
      )
    }
  }
  for (const [itemId, qty] of need) db.stock_items.find((s) => s.id === itemId)!.balance -= qty
  Object.assign(doc, {
    status: 'void',
    void_reason: blank(reason),
    voided_at: new Date().toISOString(),
    voided_by: MOCK_USER.id,
  })
  persist()
  return doc
}

export const receiptHandlers = [
  http.get(rest('receipts'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(request, withLines(request, db.receipts, 'receipt_lines', db.receipt_lines, 'receipt_id'))
  }),
  http.post(
    rest('rpc/post_receipt'),
    rpc<{ p_received_at: string | null; p_note: string | null; p_lines: LineInput[] }>((req, a) =>
      postReceipt(emailOf(req), a.p_received_at, a.p_note, a.p_lines),
    ),
  ),
  http.post(
    rest('rpc/void_receipt'),
    rpc<{ p_id: string; p_reason: string | null }>((_req, a) => voidReceipt(a.p_id, a.p_reason)),
  ),
]
