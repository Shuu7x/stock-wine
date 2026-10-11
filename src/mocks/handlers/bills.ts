import { http } from 'msw/http'
import type { Tables } from '@/lib/database.types'
import { auditNow, db, docNo, MOCK_USER, persist, PgError } from '@/mocks/db'
import { emailOf, requireAuth, respondList, rest, rpc } from '@/mocks/postgrest'

type Group = { sale_ids: string[]; customer?: string | null; note?: string | null }
const r2 = (n: number) => Math.round(n * 100) / 100

// เลียนแบบ public.issue_bills (ทั้งชุดหรือไม่บันทึกเลย)
function issueBills(email: string, issuedAt: string | null, groups: Group[]) {
  if (!groups?.length) throw new PgError('ไม่มีใบขายที่จะออกบิล')
  const used = new Set<string>()
  groups.forEach((g, i) => {
    if (!g.sale_ids?.length) throw new PgError(`บิลที่ ${i + 1}: ไม่มีใบขาย`)
    for (const id of g.sale_ids) {
      const s = db.sales.find((x) => x.id === id)
      if (!s || s.status !== 'posted' || s.bill_id || used.has(id)) {
        throw new PgError(`บิลที่ ${i + 1}: มีใบขายที่ถูกยกเลิกหรือออกบิลไปแล้ว`)
      }
      used.add(id)
    }
  })
  const out: Tables<'bills'>[] = []
  for (const g of groups) {
    const sales = db.sales.filter((s) => g.sale_ids.includes(s.id))
    db.seq.bill += 1
    const bill: Tables<'bills'> = {
      id: crypto.randomUUID(),
      bill_no: docNo('BL', db.seq.bill),
      issued_at: issuedAt ?? new Date().toISOString().slice(0, 10),
      customer: g.customer?.trim() || sales.map((s) => s.customer).filter(Boolean).sort()[0] || null,
      note: g.note?.trim() || null,
      subtotal: r2(sales.reduce((a, s) => a + s.subtotal, 0)),
      vat_amount: r2(sales.reduce((a, s) => a + s.vat_amount, 0)),
      total: r2(sales.reduce((a, s) => a + s.total, 0)),
      status: 'posted',
      void_reason: null,
      voided_at: null,
      voided_by: null,
      created_by_email: email,
      ...auditNow(),
    }
    db.bills.push(bill)
    for (const s of sales) {
      s.bill_id = bill.id
      db.bill_sales.push({ bill_id: bill.id, sale_id: s.id, ...auditNow() })
    }
    out.push(bill)
  }
  persist()
  return out
}

function voidBill(id: string, reason: string | null) {
  const bill = db.bills.find((b) => b.id === id)
  if (!bill) throw new PgError('ไม่พบบิล')
  if (bill.status === 'void') throw new PgError('บิลนี้ถูกยกเลิกแล้ว')
  for (const s of db.sales) if (s.bill_id === id) s.bill_id = null
  Object.assign(bill, { status: 'void', void_reason: reason?.trim() || null, voided_at: new Date().toISOString(), voided_by: MOCK_USER.id })
  persist()
  return bill
}

export const billHandlers = [
  http.get(rest('bills'), ({ request }) => respondList(request, requireAuth(request) ? db.bills : [])),
  http.get(rest('bill_sales'), ({ request }) => respondList(request, requireAuth(request) ? db.bill_sales : [])),
  http.post(
    rest('rpc/issue_bills'),
    rpc<{ p_issued_at: string | null; p_groups: Group[] }>((req, a) => issueBills(emailOf(req), a.p_issued_at, a.p_groups)),
  ),
  http.post(rest('rpc/void_bill'), rpc<{ p_id: string; p_reason: string | null }>((_req, a) => voidBill(a.p_id, a.p_reason))),
]
