import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { AdjustmentWithLines, SaleWithLines, TransferWithLines } from '@/features/operations/api/operations.api'
import type { ReceiptWithLines } from '@/features/receipts/api/receipts.api'
import type { Store } from '@/features/stock/api/stock.api'
import { storeName, wineLabel } from '@/features/stock/columns'
import type { WithdrawalWithLines } from '@/features/withdrawals/api/withdrawals.api'
import { fmtDate, fmtDateTime, fmtInt, fmtMaturity, fmtMoney } from '@/lib/format'
import { VAT_MODE_LABEL } from '@/lib/vat'
import type { DocType } from '../movements'

type Col = { label: string; right?: boolean }

/** เอกสารทุกประเภทแปลงเป็นรูปเดียวกันก่อนแสดง (รายการเอกสาร + drawer) */
export type DocView = {
  type: DocType
  id: string
  doc_no: string
  date: string
  status: 'posted' | 'void'
  note: string | null
  party?: string | null
  void_reason: string | null
  voided_at: string | null
  created_at: string
  created_by_email: string | null
  lineCount: number
  /** ใบขาย: บิลที่ออกแล้ว (null = ยังไม่ออกบิล) · เอกสารอื่น = undefined */
  billId?: string | null
  /** จำนวนที่แสดงในรายการ เช่น "12 ขวด" หรือ "+2 −1" */
  qty: ReactNode
  amount: number | null
  meta: Array<[string, ReactNode]>
  cols: Col[]
  lines: ReactNode[][]
  footer?: ReactNode[]
}

export type RawDoc = ReceiptWithLines | SaleWithLines | WithdrawalWithLines | TransferWithLines | AdjustmentWithLines

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
const place = (stores: Store[], storeId: number, rack: string | null) => `${storeName(stores, storeId)} · ${rack ?? '-'}`
export const localDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE')
const wineCell = (l: { wine_name: string; vintage: number | null }, sub?: string | null, badge?: ReactNode) => (
  <>
    <div className="flex flex-wrap items-center gap-1.5 font-medium">
      {wineLabel(l)}
      {badge}
    </div>
    {sub && <div className="text-xs text-muted">{sub}</div>}
  </>
)
const bottles = (n: number) => (
  <>
    <b className="tabular-nums">{fmtInt(n)}</b> ขวด
  </>
)
const base = (d: { created_by_email: string | null; created_at: string }): Array<[string, ReactNode]> => [
  ['บันทึกโดย', d.created_by_email ?? '–'],
  ['เวลาบันทึก', fmtDateTime(d.created_at)],
]

export function buildDocView(type: DocType, raw: RawDoc, stores: Store[]): DocView {
  switch (type) {
    case 'receipts': {
      const d = raw as ReceiptWithLines
      const ls = [...d.receipt_lines].sort((a, b) => a.line_no - b.line_no)
      const value = sum(ls, (l) => l.qty * (l.price_per_bottle ?? 0))
      return {
        ...d,
        type,
        date: d.received_at,
        party: d.supplier,
        lineCount: ls.length,
        qty: bottles(sum(ls, (l) => l.qty)),
        amount: value,
        meta: [
          ['วันที่รับเข้า', fmtDate(d.received_at)],
          ['ซื้อจากใคร', d.supplier ?? '–'],
          ['วันที่ซื้อ', d.purchase_date ? fmtDate(d.purchase_date) : '–'],
          ...base(d),
          ['มูลค่ารวม', `${fmtMoney(value)} บาท`],
        ],
        cols: [{ label: 'ไวน์' }, { label: 'คลัง · Rack' }, { label: 'ขวด', right: true }, { label: 'ราคา/ขวด', right: true }],
        lines: ls.map((l) => [
          wineCell(
            l,
            [l.supplier, fmtMaturity(l.maturity_from, l.maturity_to), l.remark].filter(Boolean).join(' · '),
            l.is_new_item ? <Badge tone="gold">ใหม่</Badge> : null,
          ),
          place(stores, l.store_id, l.rack),
          <b>{l.qty}</b>,
          fmtMoney(l.price_per_bottle),
        ]),
      }
    }
    case 'withdrawals': {
      const d = raw as WithdrawalWithLines
      const ls = [...d.withdrawal_lines].sort((a, b) => a.line_no - b.line_no)
      return {
        ...d,
        type,
        date: localDate(d.created_at),
        lineCount: ls.length,
        qty: bottles(sum(ls, (l) => l.qty)),
        amount: null,
        meta: base(d),
        cols: [{ label: 'ไวน์' }, { label: 'คลัง · Rack' }, { label: 'วันที่เบิก' }, { label: 'ขวด', right: true }],
        lines: ls.map((l) => [wineCell(l, l.remark), place(stores, l.store_id, l.rack), fmtDate(l.withdraw_date), <b>{l.qty}</b>]),
      }
    }
    case 'sales': {
      const d = raw as SaleWithLines
      const ls = [...d.sale_lines].sort((a, b) => a.line_no - b.line_no)
      return {
        ...d,
        type,
        date: d.sold_at,
        party: d.customer,
        billId: d.bill_id,
        lineCount: ls.length,
        qty: bottles(sum(ls, (l) => l.qty)),
        amount: d.total,
        meta: [
          ['ลูกค้า', d.customer ?? '–'],
          ['วันที่ขาย', fmtDate(d.sold_at)],
          ['ราคาที่กรอก', `${VAT_MODE_LABEL[d.vat_mode]} (VAT ${d.vat_rate}%)`],
          ...base(d),
        ],
        cols: [
          { label: 'ไวน์' },
          { label: 'ขวด', right: true },
          { label: 'ราคา/ขวด', right: true },
          { label: 'VAT', right: true },
          { label: 'รวม', right: true },
        ],
        lines: ls.map((l) => [
          wineCell(l, [place(stores, l.store_id, l.rack), l.remark].filter(Boolean).join(' · ')),
          <b>{l.qty}</b>,
          fmtMoney(l.unit_price),
          l.has_vat ? fmtMoney(l.vat_amount) : <span className="text-muted">ไม่มี</span>,
          <b>{fmtMoney(l.line_total)}</b>,
        ]),
        footer: [
          'ยอดก่อน VAT / VAT / รวม',
          '',
          fmtMoney(d.subtotal),
          fmtMoney(d.vat_amount),
          <span className="text-base text-brand-900">{fmtMoney(d.total)}</span>,
        ],
      }
    }
    case 'transfers': {
      const d = raw as TransferWithLines
      const ls = [...d.transfer_lines].sort((a, b) => a.line_no - b.line_no)
      return {
        ...d,
        type,
        date: d.transferred_at,
        lineCount: ls.length,
        qty: bottles(sum(ls, (l) => l.qty)),
        amount: null,
        meta: [['วันที่โอนย้าย', fmtDate(d.transferred_at)], ...base(d)],
        cols: [{ label: 'ไวน์' }, { label: 'จาก → ไป' }, { label: 'ขวด', right: true }],
        lines: ls.map((l) => [
          wineCell(l, l.remark, l.to_is_new_item ? <Badge tone="gold">สร้างใหม่</Badge> : null),
          <span className="flex flex-wrap items-center gap-1 text-ink-2">
            {place(stores, l.from_store_id, l.from_rack)}
            <ArrowRight className="size-3.5 text-muted" />
            {place(stores, l.to_store_id, l.to_rack)}
          </span>,
          <b>{l.qty}</b>,
        ]),
      }
    }
    case 'adjustments': {
      const d = raw as AdjustmentWithLines
      const ls = [...d.stock_adjustment_lines].sort((a, b) => a.line_no - b.line_no)
      const plus = sum(ls, (l) => Math.max(0, l.diff))
      const minus = sum(ls, (l) => Math.min(0, l.diff))
      return {
        ...d,
        type,
        date: d.adjusted_at,
        lineCount: ls.length,
        qty: (
          <span className="tabular-nums">
            {plus > 0 && <b className="text-info-600">+{plus}</b>}
            {plus > 0 && minus < 0 && ' '}
            {minus < 0 && <b className="text-danger-700">{minus}</b>} ขวด
          </span>
        ),
        amount: null,
        meta: [['วันที่ปรับยอด', fmtDate(d.adjusted_at)], ...base(d)],
        cols: [{ label: 'ไวน์' }, { label: 'ในระบบ → นับได้', right: true }, { label: 'ผลต่าง', right: true }, { label: 'สาเหตุ' }],
        lines: ls.map((l) => [
          wineCell(l, [place(stores, l.store_id, l.rack), l.remark].filter(Boolean).join(' · ')),
          `${l.balance_before} → ${l.balance_after}`,
          <b className={l.diff > 0 ? 'text-info-600' : 'text-danger-700'}>{l.diff > 0 ? `+${l.diff}` : l.diff}</b>,
          l.reason,
        ]),
      }
    }
  }
}
