import { http } from 'msw/http'
import type { Tables } from '@/lib/database.types'
import { auditNow, db, docNo, MOCK_USER, persist, PgError } from '@/mocks/db'
import { emailOf, requireAuth, respondList, rest, rpc, withLines } from '@/mocks/postgrest'

type LineInput = { stock_item_id: string; qty: number; withdraw_date: string | null; remark: string | null }

// เลียนแบบ public.post_withdrawal
function postWithdrawal(email: string, note: string | null, lines: LineInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new PgError('ไม่มีรายการเบิก')
  const items = structuredClone(db.stock_items)
  const doc: Tables<'withdrawals'> = {
    id: crypto.randomUUID(),
    doc_no: docNo('WD', db.seq.withdrawal + 1),
    note: note?.trim() || null,
    status: 'posted',
    void_reason: null,
    voided_at: null,
    voided_by: null,
    created_by_email: email,
    ...auditNow(),
  }
  const newLines: Tables<'withdrawal_lines'>[] = lines.map((l, i) => {
    const item = items.find((s) => s.id === l.stock_item_id && s.deleted_at == null)
    if (!item) throw new PgError(`แถว ${i + 1}: ไม่พบไวน์ในสต็อก`)
    if (!(l.qty > 0)) throw new PgError(`แถว ${i + 1}: จำนวนเบิกต้องมากกว่า 0`)
    if (l.qty > item.balance) {
      throw new PgError(`แถว ${i + 1}: ${item.wine_name} คงเหลือ ${item.balance} ขวด เบิก ${l.qty} ขวดไม่ได้`)
    }
    item.balance -= l.qty
    return {
      id: crypto.randomUUID(),
      withdrawal_id: doc.id,
      line_no: i + 1,
      stock_item_id: item.id,
      withdraw_date: l.withdraw_date ?? new Date().toISOString().slice(0, 10),
      qty: l.qty,
      remark: l.remark?.trim() || null,
      store_id: item.store_id,
      rack: item.rack,
      country: item.country,
      wine_name: item.wine_name,
      vintage: item.vintage,
      price_per_bottle: item.price_per_bottle,
      ...auditNow(),
    }
  })
  db.seq.withdrawal += 1
  db.stock_items = items
  db.withdrawals.push(doc)
  db.withdrawal_lines.push(...newLines)
  persist()
  return doc
}

// เลียนแบบ public.void_withdrawal
function voidWithdrawal(id: string, reason: string | null) {
  const doc = db.withdrawals.find((r) => r.id === id)
  if (!doc) throw new PgError('ไม่พบเอกสาร')
  if (doc.status === 'void') throw new PgError('เอกสารนี้ถูกยกเลิกแล้ว')
  for (const l of db.withdrawal_lines.filter((x) => x.withdrawal_id === id)) {
    db.stock_items.find((s) => s.id === l.stock_item_id)!.balance += l.qty
  }
  Object.assign(doc, {
    status: 'void',
    void_reason: reason?.trim() || null,
    voided_at: new Date().toISOString(),
    voided_by: MOCK_USER.id,
  })
  persist()
  return doc
}

export const withdrawalHandlers = [
  http.get(rest('withdrawals'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(
      request,
      withLines(request, db.withdrawals, 'withdrawal_lines', db.withdrawal_lines, 'withdrawal_id'),
    )
  }),
  http.post(
    rest('rpc/post_withdrawal'),
    rpc<{ p_note: string | null; p_lines: LineInput[] }>((req, a) =>
      postWithdrawal(emailOf(req), a.p_note, a.p_lines),
    ),
  ),
  http.post(
    rest('rpc/void_withdrawal'),
    rpc<{ p_id: string; p_reason: string | null }>((_req, a) => voidWithdrawal(a.p_id, a.p_reason)),
  ),
]
