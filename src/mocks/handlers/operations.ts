import { http } from 'msw/http'
import type { StockAction, Tables, VatMode } from '@/lib/database.types'
import { lineVat, sumVat } from '@/lib/vat'
import { auditNow, db, docNo, logStockChange, MOCK_USER, persist, PgError } from '@/mocks/db'
import { stockIdentity } from '@/mocks/handlers/stock'
import { emailOf, requireAuth, respondList, rest, rpc, withLines } from '@/mocks/postgrest'

type Item = Tables<'stock_items'>
type Log = [Item | null, Item, StockAction]

const blank = (s: string | null | undefined) => (s ?? '').trim() || null
const today = () => new Date().toISOString().slice(0, 10)
const docBase = (email: string, prefix: 'SO' | 'AJ' | 'TF', n: number, note: string | null) => ({
  id: crypto.randomUUID(),
  doc_no: docNo(prefix, n),
  note: blank(note),
  status: 'posted' as const,
  void_reason: null,
  voided_at: null,
  voided_by: null,
  created_by_email: email,
  ...auditNow(),
})
const voidFields = (reason: string | null) => ({
  status: 'void' as const,
  void_reason: blank(reason),
  voided_at: new Date().toISOString(),
  voided_by: MOCK_USER.id,
})
const vatRate = () => Number(db.app_settings.find((s) => s.key === 'vat_rate')?.value ?? 7)

/** ทำบนสำเนาสต็อก แล้วค่อยแทนที่ — เลียนแบบ transaction */
function commit(items: Item[], logs: Log[], email: string, ref: string) {
  db.stock_items = items
  for (const [b, a, action] of logs) logStockChange(b, a, email, action, ref)
}

function liveItem(items: Item[], id: string, row: number) {
  const it = items.find((s) => s.id === id && !s.deleted_at)
  if (!it) throw new PgError(`แถว ${row}: ไม่พบไวน์ในสต็อก`)
  return it
}

// ─── ขาย ──────────────────────────────────────────────────────────────────
type SaleInput = { stock_item_id: string; qty: number; unit_price: number; has_vat: boolean; remark: string | null }

function postSale(email: string, a: { p_sold_at: string; p_customer: string | null; p_note: string | null; p_vat_mode: VatMode; p_lines: SaleInput[] }) {
  if (!a.p_lines?.length) throw new PgError('ไม่มีรายการขาย')
  if (a.p_vat_mode !== 'included' && a.p_vat_mode !== 'excluded') throw new PgError('รูปแบบ VAT ไม่ถูกต้อง')
  const rate = vatRate()
  const items = structuredClone(db.stock_items)
  const logs: Log[] = []
  const doc: Tables<'sales'> = {
    ...docBase(email, 'SO', db.seq.sale + 1, a.p_note),
    sold_at: a.p_sold_at ?? today(),
    customer: blank(a.p_customer),
    vat_mode: a.p_vat_mode,
    vat_rate: rate,
    subtotal: 0,
    vat_amount: 0,
    total: 0,
  }
  const lines = a.p_lines.map((l, i): Tables<'sale_lines'> => {
    const it = liveItem(items, l.stock_item_id, i + 1)
    if (!(l.qty > 0)) throw new PgError(`แถว ${i + 1}: จำนวนขายต้องมากกว่า 0`)
    if (l.unit_price == null || l.unit_price < 0) throw new PgError(`แถว ${i + 1}: ราคาขายไม่ถูกต้อง`)
    if (l.qty > it.balance) throw new PgError(`แถว ${i + 1}: ${it.wine_name} คงเหลือ ${it.balance} ขวด ขาย ${l.qty} ขวดไม่ได้`)
    const before = structuredClone(it)
    it.balance -= l.qty
    logs.push([before, structuredClone(it), 'sale'])
    const v = lineVat(l.qty, l.unit_price, l.has_vat ?? true, a.p_vat_mode, rate)
    return {
      id: crypto.randomUUID(),
      sale_id: doc.id,
      line_no: i + 1,
      stock_item_id: it.id,
      qty: l.qty,
      unit_price: l.unit_price,
      has_vat: l.has_vat ?? true,
      amount_before_vat: v.before,
      vat_amount: v.vat,
      line_total: v.total,
      remark: blank(l.remark),
      store_id: it.store_id,
      rack: it.rack,
      country: it.country,
      wine_name: it.wine_name,
      vintage: it.vintage,
      cost_per_bottle: it.price_per_bottle,
      ...auditNow(),
    }
  })
  const t = sumVat(lines.map((l) => ({ before: l.amount_before_vat, vat: l.vat_amount, total: l.line_total })))
  Object.assign(doc, { subtotal: t.before, vat_amount: t.vat, total: t.total })
  db.seq.sale += 1
  commit(items, logs, email, doc.doc_no)
  db.sales.push(doc)
  db.sale_lines.push(...lines)
  persist()
  return doc
}

function voidSale(email: string, id: string, reason: string | null) {
  const doc = db.sales.find((d) => d.id === id)
  if (!doc) throw new PgError('ไม่พบเอกสาร')
  if (doc.status === 'void') throw new PgError('เอกสารนี้ถูกยกเลิกแล้ว')
  const items = structuredClone(db.stock_items)
  const logs: Log[] = []
  for (const l of db.sale_lines.filter((x) => x.sale_id === id)) {
    const it = items.find((s) => s.id === l.stock_item_id)!
    const before = structuredClone(it)
    it.balance += l.qty
    logs.push([before, structuredClone(it), 'void_sale'])
  }
  commit(items, logs, email, doc.doc_no)
  Object.assign(doc, voidFields(reason))
  persist()
  return doc
}

// ─── ปรับยอด ───────────────────────────────────────────────────────────────
type AdjInput = { stock_item_id: string; counted: number; reason: string; remark: string | null }

function postAdjustment(email: string, a: { p_adjusted_at: string; p_note: string | null; p_lines: AdjInput[] }) {
  if (!a.p_lines?.length) throw new PgError('ไม่มีรายการปรับยอด')
  const items = structuredClone(db.stock_items)
  const logs: Log[] = []
  const doc: Tables<'stock_adjustments'> = {
    ...docBase(email, 'AJ', db.seq.adjustment + 1, a.p_note),
    adjusted_at: a.p_adjusted_at ?? today(),
  }
  const lines: Tables<'stock_adjustment_lines'>[] = []
  a.p_lines.forEach((l, i) => {
    const it = liveItem(items, l.stock_item_id, i + 1)
    if (l.counted == null || l.counted < 0 || !Number.isInteger(l.counted)) throw new PgError(`แถว ${i + 1}: จำนวนที่นับได้ไม่ถูกต้อง`)
    if (!l.reason?.trim()) throw new PgError(`แถว ${i + 1}: ต้องระบุสาเหตุ`)
    if (l.counted === it.balance) return
    const before = structuredClone(it)
    it.balance = l.counted
    logs.push([before, structuredClone(it), 'adjust'])
    lines.push({
      id: crypto.randomUUID(),
      adjustment_id: doc.id,
      line_no: i + 1,
      stock_item_id: it.id,
      balance_before: before.balance,
      balance_after: l.counted,
      diff: l.counted - before.balance,
      reason: l.reason.trim(),
      remark: blank(l.remark),
      store_id: it.store_id,
      rack: it.rack,
      wine_name: it.wine_name,
      vintage: it.vintage,
      ...auditNow(),
    })
  })
  if (!lines.length) throw new PgError('ทุกรายการยอดตรงกับระบบอยู่แล้ว ไม่มีอะไรต้องปรับ')
  db.seq.adjustment += 1
  commit(items, logs, email, doc.doc_no)
  db.stock_adjustments.push(doc)
  db.stock_adjustment_lines.push(...lines)
  persist()
  return doc
}

function voidAdjustment(email: string, id: string, reason: string | null) {
  const doc = db.stock_adjustments.find((d) => d.id === id)
  if (!doc) throw new PgError('ไม่พบเอกสาร')
  if (doc.status === 'void') throw new PgError('เอกสารนี้ถูกยกเลิกแล้ว')
  const items = structuredClone(db.stock_items)
  const logs: Log[] = []
  for (const l of db.stock_adjustment_lines.filter((x) => x.adjustment_id === id)) {
    const it = items.find((s) => s.id === l.stock_item_id)!
    if (it.balance - l.diff < 0) throw new PgError(`ยกเลิกไม่ได้: ${it.wine_name} คงเหลือไม่พอให้ปรับกลับ`)
    const before = structuredClone(it)
    it.balance -= l.diff
    logs.push([before, structuredClone(it), 'void_adjustment'])
  }
  commit(items, logs, email, doc.doc_no)
  Object.assign(doc, voidFields(reason))
  persist()
  return doc
}

// ─── โอนย้าย ──────────────────────────────────────────────────────────────
type TfInput = { stock_item_id: string; qty: number; to_store_id: number; to_rack: string | null; remark: string | null }

function postTransfer(email: string, a: { p_transferred_at: string; p_note: string | null; p_lines: TfInput[] }) {
  if (!a.p_lines?.length) throw new PgError('ไม่มีรายการโอนย้าย')
  const items = structuredClone(db.stock_items)
  const logs: Log[] = []
  const doc: Tables<'transfers'> = {
    ...docBase(email, 'TF', db.seq.transfer + 1, a.p_note),
    transferred_at: a.p_transferred_at ?? today(),
  }
  const lines = a.p_lines.map((l, i): Tables<'transfer_lines'> => {
    const src = liveItem(items, l.stock_item_id, i + 1)
    const toRack = blank(l.to_rack)
    if (!(l.qty > 0)) throw new PgError(`แถว ${i + 1}: จำนวนโอนต้องมากกว่า 0`)
    if (l.qty > src.balance) throw new PgError(`แถว ${i + 1}: ${src.wine_name} คงเหลือ ${src.balance} ขวด โอน ${l.qty} ขวดไม่ได้`)
    if (!db.stores.some((s) => s.id === l.to_store_id && s.is_active)) throw new PgError(`แถว ${i + 1}: คลังปลายทางไม่ถูกต้อง`)
    if (l.to_store_id === src.store_id && (toRack ?? '').toLowerCase() === (src.rack ?? '').trim().toLowerCase()) {
      throw new PgError(`แถว ${i + 1}: ปลายทางต้องต่างจากต้นทาง (คลังหรือ rack)`)
    }
    const b1 = structuredClone(src)
    src.balance -= l.qty
    logs.push([b1, structuredClone(src), 'transfer_out'])

    const key = stockIdentity({ store_id: l.to_store_id, wine_name: src.wine_name, vintage: src.vintage, rack: toRack })
    let dst = items.find((s) => !s.deleted_at && stockIdentity(s) === key)
    const isNew = !dst
    if (!dst) {
      dst = { ...structuredClone(src), id: crypto.randomUUID(), store_id: l.to_store_id, rack: toRack, balance: l.qty, ...auditNow() }
      items.push(dst)
      logs.push([null, structuredClone(dst), 'transfer_in'])
    } else {
      const b2 = structuredClone(dst)
      dst.balance += l.qty
      logs.push([b2, structuredClone(dst), 'transfer_in'])
    }
    return {
      id: crypto.randomUUID(),
      transfer_id: doc.id,
      line_no: i + 1,
      from_stock_item_id: src.id,
      to_stock_item_id: dst.id,
      to_is_new_item: isNew,
      qty: l.qty,
      remark: blank(l.remark),
      from_store_id: src.store_id,
      from_rack: src.rack,
      to_store_id: l.to_store_id,
      to_rack: toRack,
      wine_name: src.wine_name,
      vintage: src.vintage,
      ...auditNow(),
    }
  })
  db.seq.transfer += 1
  commit(items, logs, email, doc.doc_no)
  db.transfers.push(doc)
  db.transfer_lines.push(...lines)
  persist()
  return doc
}

function voidTransfer(email: string, id: string, reason: string | null) {
  const doc = db.transfers.find((d) => d.id === id)
  if (!doc) throw new PgError('ไม่พบเอกสาร')
  if (doc.status === 'void') throw new PgError('เอกสารนี้ถูกยกเลิกแล้ว')
  const items = structuredClone(db.stock_items)
  const logs: Log[] = []
  for (const l of db.transfer_lines.filter((x) => x.transfer_id === id)) {
    const dst = items.find((s) => s.id === l.to_stock_item_id)!
    if (dst.balance < l.qty) {
      throw new PgError(`ยกเลิกไม่ได้: ${dst.wine_name} ที่ปลายทางคงเหลือ ${dst.balance} ขวด น้อยกว่าที่โอนมา ${l.qty} ขวด`)
    }
    const b1 = structuredClone(dst)
    dst.balance -= l.qty
    logs.push([b1, structuredClone(dst), 'void_transfer'])
    const src = items.find((s) => s.id === l.from_stock_item_id)!
    const b2 = structuredClone(src)
    src.balance += l.qty
    logs.push([b2, structuredClone(src), 'void_transfer'])
  }
  commit(items, logs, email, doc.doc_no)
  Object.assign(doc, voidFields(reason))
  persist()
  return doc
}

type VoidArgs = { p_id: string; p_reason: string | null }

export const operationHandlers = [
  http.get(rest('sales'), ({ request }) =>
    respondList(request, requireAuth(request) ? withLines(request, db.sales, 'sale_lines', db.sale_lines, 'sale_id') : []),
  ),
  http.get(rest('stock_adjustments'), ({ request }) =>
    respondList(
      request,
      requireAuth(request)
        ? withLines(request, db.stock_adjustments, 'stock_adjustment_lines', db.stock_adjustment_lines, 'adjustment_id')
        : [],
    ),
  ),
  http.get(rest('transfers'), ({ request }) =>
    respondList(request, requireAuth(request) ? withLines(request, db.transfers, 'transfer_lines', db.transfer_lines, 'transfer_id') : []),
  ),
  http.post(rest('rpc/post_sale'), rpc<Parameters<typeof postSale>[1]>((req, a) => postSale(emailOf(req), a))),
  http.post(rest('rpc/void_sale'), rpc<VoidArgs>((req, a) => voidSale(emailOf(req), a.p_id, a.p_reason))),
  http.post(rest('rpc/post_adjustment'), rpc<Parameters<typeof postAdjustment>[1]>((req, a) => postAdjustment(emailOf(req), a))),
  http.post(rest('rpc/void_adjustment'), rpc<VoidArgs>((req, a) => voidAdjustment(emailOf(req), a.p_id, a.p_reason))),
  http.post(rest('rpc/post_transfer'), rpc<Parameters<typeof postTransfer>[1]>((req, a) => postTransfer(emailOf(req), a))),
  http.post(rest('rpc/void_transfer'), rpc<VoidArgs>((req, a) => voidTransfer(emailOf(req), a.p_id, a.p_reason))),
]
