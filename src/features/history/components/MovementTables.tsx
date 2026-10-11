import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { ExportButton } from '@/components/ui/export-button'
import { Input } from '@/components/ui/field'
import { Loading } from '@/components/ui/loading'
import { adjustmentsListOptions, salesListOptions, transfersListOptions } from '@/features/operations/api/operations.api'
import { receiptsListOptions } from '@/features/receipts/api/receipts.api'
import type { Store } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { withdrawalsListOptions } from '@/features/withdrawals/api/withdrawals.api'
import type { DocFilter } from '@/lib/doc-filter'
import { exportXlsx, type XlsxColumn, type XlsxValue } from '@/lib/export-xlsx'
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, todayIso } from '@/lib/format'
import { queryClient } from '@/lib/query-client'
import { logsTableOptions, type StockItemLog } from '../api/logs.api'
import { actionOf, FIELD_LABELS, fmtField } from './LogList'

/**
 * ตารางแบบอ่านอย่างเดียว ใช้ได้ทั้งในหน้าจอ (DataGrid: กรอง/เรียง/ค้นหา) และ Excel
 * kind: date = yyyy-mm-dd · datetime · money · int · text
 */
type Def<R> = {
  key: string
  title: string
  width: number
  kind?: 'date' | 'datetime' | 'money' | 'int' | 'text'
  value: (r: R) => XlsxValue
  render?: (r: R) => ReactNode
  total?: boolean
}

function toGrid<R>(defs: Def<R>[]): GridColumn<R>[] {
  return defs.map((d) => ({
    key: d.key,
    title: d.title,
    width: d.width,
    frozen: d.key === 'wine' || d.key === 'vintage',
    readOnly: true,
    type: d.kind === 'money' || d.kind === 'int' ? 'number' : undefined,
    align: d.kind === 'money' || d.kind === 'int' ? 'right' : d.kind === 'date' ? 'center' : undefined,
    get: (r) => {
      const v = d.value(r)
      return v instanceof Date ? v.toISOString() : (v ?? null)
    },
    format: (v) =>
      v == null
        ? ''
        : d.kind === 'date'
          ? fmtDate(String(v))
          : d.kind === 'datetime'
            ? fmtDateTime(String(v))
            : d.kind === 'money'
              ? fmtMoney(Number(v))
              : d.kind === 'int'
                ? fmtInt(Number(v))
                : String(v),
    render: d.render,
  }))
}

function toXlsx<R>(defs: Def<R>[]): XlsxColumn<R>[] {
  return defs.map((d) => ({
    header: d.title,
    width: Math.max(8, Math.round(d.width / 7)),
    value: (r) => {
      const v = d.value(r)
      if (v == null || v === '') return null
      if (d.kind === 'date' && typeof v === 'string') return new Date(`${v.slice(0, 10)}T00:00:00`)
      if (d.kind === 'datetime' && typeof v === 'string') return fmtDateTime(v)
      return v
    },
    numFmt: d.kind === 'money' ? '#,##0.00' : d.kind === 'int' ? '#,##0' : undefined,
    align: d.kind === 'money' || d.kind === 'int' ? 'right' : d.kind === 'date' ? 'center' : undefined,
    total: d.total ? 'sum' : undefined,
  }))
}

/** แถบเครื่องมือเหนือตาราง: ค้นหา · จำนวน · ส่งออก Excel */
function TableBar({ q, setQ, count, onExport, exporting, noun }: { q: string; setQ: (v: string) => void; count: number; onExport: () => void; exporting: boolean; noun: string }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <label className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาไวน์ เลขที่เอกสาร …" className="pl-9" />
      </label>
      <span className="text-sm text-muted">
        {fmtInt(count)} {noun}
      </span>
      <ExportButton className="ml-auto" onClick={onExport} loading={exporting} disabled={!count} />
    </div>
  )
}

const STATUS: Record<'posted' | 'void', string> = { posted: 'บันทึกแล้ว', void: 'ยกเลิก' }
const statusCol = <R extends { status: 'posted' | 'void' }>(): Def<R> => ({
  key: 'status',
  title: 'สถานะ',
  width: 96,
  value: (r) => STATUS[r.status],
  render: (r) => (r.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>),
})

// ─── แท็บ "ทั้งหมด": ทุกความเคลื่อนไหวของสต็อก ────────────────────────────────
type LogRow = StockItemLog & { _label: string; _diff: number | null; _detail: string }

export function MovementTable({ stores, filter }: { stores: Store[]; filter: { from?: string; to?: string } }) {
  const q = useQuery(logsTableOptions(filter))
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const rows = useMemo<LogRow[]>(
    () =>
      (q.data ?? []).map((l) => {
        const bal = l.changes.balance as { old?: number | null; new?: number | null } | undefined
        const diff = bal && typeof bal.new === 'number' ? bal.new - (typeof bal.old === 'number' ? bal.old : 0) : null
        const detail = Object.entries(l.changes)
          .filter(([k]) => k !== 'deleted_at' && k !== 'balance')
          .map(([k, ch]) => `${FIELD_LABELS[k] ?? k}: ${fmtField(stores, k, ch.old)} → ${fmtField(stores, k, ch.new)}`)
          .join(' · ')
        return { ...l, _label: actionOf(l).label, _diff: diff, _detail: detail }
      }),
    [q.data, stores],
  )

  const defs: Def<LogRow>[] = [
    { key: 'at', title: 'วันเวลา', width: 150, kind: 'datetime', value: (r) => r.created_at },
    {
      key: 'action',
      title: 'ประเภท',
      width: 120,
      value: (r) => r._label,
      render: (r) => <Badge tone={actionOf(r).tone}>{r._label}</Badge>,
    },
    { key: 'ref', title: 'เอกสาร', width: 120, value: (r) => r.ref_doc },
    { key: 'wine', title: 'Name of wine', width: 260, value: (r) => r.wine_name },
    { key: 'vintage', title: 'Year', width: 70, value: (r) => r.vintage ?? 'NV' },
    { key: 'store', title: 'Store', width: 150, value: (r) => storeName(stores, r.store_id) },
    {
      key: 'diff',
      title: 'จำนวน (ขวด)',
      width: 100,
      kind: 'int',
      value: (r) => r._diff,
      render: (r) =>
        r._diff == null || r._diff === 0 ? null : (
          <b className={r._diff > 0 ? 'text-success-700' : 'text-danger-700'}>
            {r._diff > 0 ? '+' : ''}
            {fmtInt(r._diff)}
          </b>
        ),
      total: true,
    },
    {
      key: 'balance',
      title: 'คงเหลือหลังรายการ',
      width: 130,
      kind: 'int',
      value: (r) => {
        const b = r.changes.balance as { new?: number | null } | undefined
        return typeof b?.new === 'number' ? b.new : null
      },
    },
    { key: 'detail', title: 'ข้อมูลที่เปลี่ยน', width: 320, value: (r) => r._detail || null },
    { key: 'by', title: 'ผู้ทำรายการ', width: 170, value: (r) => r.created_by_email },
  ]
  const columns = toGrid(defs)

  async function exportFile() {
    setExporting(true)
    try {
      await exportXlsx({
        fileName: `ความเคลื่อนไหว-ทั้งหมด-${todayIso()}.xlsx`,
        sheets: [{ name: 'ความเคลื่อนไหว', title: 'ความเคลื่อนไหวของสต็อก (ทั้งหมด)', subtitle: rangeText(filter), columns: toXlsx(defs), rows }],
      })
    } finally {
      setExporting(false)
    }
  }

  if (q.isLoading) return <Loading screen />
  return (
    <>
      <TableBar q={search} setQ={setSearch} count={rows.length} onExport={exportFile} exporting={exporting} noun="รายการ" />
      <DataGrid
        className="min-h-[360px] flex-1"
        rows={rows}
        columns={columns}
        getRowId={(r) => String(r.id)}
        search={search}
        onClearSearch={() => setSearch('')}
        pageSizeKey="history-all"
        card={{
          noun: 'รายการ',
          title: (r) => `${r.wine_name} ${r.vintage ?? 'NV'}`,
          subtitle: (r) => `${fmtDateTime(r.created_at)} · ${storeName(stores, r.store_id)}${r.ref_doc ? ` · ${r.ref_doc}` : ''}`,
          fields: ['action', 'diff', 'detail', 'by'],
        }}
        emptyState="ยังไม่มีความเคลื่อนไหวในช่วงนี้"
      />
    </>
  )
}

const rangeText = (f: DocFilter) =>
  f.from || f.to ? `ช่วง ${f.from ? fmtDate(f.from) : 'แรกสุด'} – ${f.to ? fmtDate(f.to) : 'วันนี้'}` : 'ทุกช่วงเวลา'

// ─── แท็บเอกสาร: บรรทัดของเอกสาร (ตารางใน drawer · แผ่นรายรายการใน Excel) ───────────
export type DocTab = 'receipts' | 'sales' | 'withdrawals' | 'transfers' | 'adjustments'
type Line = { _id: string; status: 'posted' | 'void' } & Record<string, unknown>

const ALL = 1000 // เอกสารต่อครั้งตอนส่งออก

/** บรรทัดของเอกสาร (หลายใบรวมกัน) → แถวตาราง */
function docLines(tab: DocTab, docs: Array<Record<string, any>>, stores: Store[]): Line[] {
  const byNo = (ls: Array<Record<string, any>>) => [...ls].sort((a, b) => a.line_no - b.line_no)
  const sn = (id: number | null) => (id == null ? '' : storeName(stores, id))
  switch (tab) {
    case 'receipts':
      return docs.flatMap((d) =>
        byNo(d.receipt_lines).map((l) => ({
          _id: l.id, status: d.status, date: d.received_at, doc_no: d.doc_no, supplier: l.supplier ?? d.supplier,
          wine: l.wine_name, vintage: l.vintage ?? 'NV', store: sn(l.store_id), rack: l.rack, qty: l.qty,
          price: l.price_per_bottle, value: l.price_per_bottle == null ? null : l.qty * l.price_per_bottle,
          kind: l.is_new_item ? 'ใหม่' : 'เพิ่มยอด', remark: l.remark, note: d.note,
        })),
      )
    case 'sales':
      return docs.flatMap((d) =>
        byNo(d.sale_lines).map((l) => ({
          _id: l.id, status: d.status, date: d.sold_at, doc_no: d.doc_no, customer: d.customer,
          wine: l.wine_name, vintage: l.vintage ?? 'NV', store: sn(l.store_id), rack: l.rack, qty: l.qty,
          price: l.unit_price, before: l.amount_before_vat, vat: l.vat_amount, total: l.line_total,
          cost: l.cost_per_bottle, remark: l.remark,
        })),
      )
    case 'withdrawals':
      return docs.flatMap((d) =>
        byNo(d.withdrawal_lines).map((l) => ({
          _id: l.id, status: d.status, date: l.withdraw_date, doc_no: d.doc_no,
          wine: l.wine_name, vintage: l.vintage ?? 'NV', store: sn(l.store_id), rack: l.rack, qty: l.qty,
          remark: l.remark, note: d.note,
        })),
      )
    case 'transfers':
      return docs.flatMap((d) =>
        byNo(d.transfer_lines).map((l) => ({
          _id: l.id, status: d.status, date: d.transferred_at, doc_no: d.doc_no,
          wine: l.wine_name, vintage: l.vintage ?? 'NV', from: `${sn(l.from_store_id)} · ${l.from_rack ?? '-'}`,
          to: `${sn(l.to_store_id)} · ${l.to_rack ?? '-'}`, qty: l.qty, remark: l.remark, note: d.note,
        })),
      )
    case 'adjustments':
      return docs.flatMap((d) =>
        byNo(d.stock_adjustment_lines).map((l) => ({
          _id: l.id, status: d.status, date: d.adjusted_at, doc_no: d.doc_no,
          wine: l.wine_name, vintage: l.vintage ?? 'NV', store: sn(l.store_id), rack: l.rack,
          before: l.balance_before, after: l.balance_after, diff: l.diff, reason: l.reason, remark: l.remark, note: d.note,
        })),
      )
  }
}

const v = (k: string) => (r: Line) => (r[k] ?? null) as XlsxValue

function lineDefs(tab: DocTab): Def<Line>[] {
  const head: Def<Line>[] = [
    { key: 'date', title: 'วันที่', width: 100, kind: 'date', value: v('date') },
    { key: 'doc_no', title: 'เลขที่', width: 120, value: v('doc_no') },
    statusCol<Line>(),
  ]
  const wine: Def<Line>[] = [
    { key: 'wine', title: 'Name of wine', width: 260, value: v('wine') },
    { key: 'vintage', title: 'Year', width: 70, value: v('vintage') },
  ]
  const place: Def<Line>[] = [
    { key: 'store', title: 'Store', width: 150, value: v('store') },
    { key: 'rack', title: 'Wine racks', width: 100, value: v('rack') },
  ]
  switch (tab) {
    case 'receipts':
      return [
        ...head, ...wine, ...place,
        { key: 'qty', title: 'จำนวน (ขวด)', width: 100, kind: 'int', value: v('qty'), total: true },
        { key: 'price', title: 'Price/Btl.', width: 110, kind: 'money', value: v('price') },
        { key: 'value', title: 'มูลค่า', width: 120, kind: 'money', value: v('value'), total: true },
        { key: 'kind', title: 'สถานะไวน์', width: 100, value: v('kind') },
        { key: 'supplier', title: 'ซื้อจากใคร', width: 150, value: v('supplier') },
        { key: 'remark', title: 'Remark', width: 180, value: v('remark') },
        { key: 'note', title: 'หมายเหตุเอกสาร', width: 180, value: v('note') },
      ]
    case 'sales':
      return [
        ...head,
        { key: 'customer', title: 'ลูกค้า', width: 160, value: v('customer') },
        ...wine, ...place,
        { key: 'qty', title: 'จำนวน (ขวด)', width: 100, kind: 'int', value: v('qty'), total: true },
        { key: 'price', title: 'ราคาขาย/ขวด', width: 120, kind: 'money', value: v('price') },
        { key: 'before', title: 'ก่อน VAT', width: 120, kind: 'money', value: v('before'), total: true },
        { key: 'vat', title: 'VAT', width: 100, kind: 'money', value: v('vat'), total: true },
        { key: 'total', title: 'รวม', width: 120, kind: 'money', value: v('total'), total: true },
        { key: 'cost', title: 'ต้นทุน/ขวด', width: 110, kind: 'money', value: v('cost') },
        { key: 'remark', title: 'Remark', width: 180, value: v('remark') },
      ]
    case 'withdrawals':
      return [
        ...head, ...wine, ...place,
        { key: 'qty', title: 'จำนวน (ขวด)', width: 100, kind: 'int', value: v('qty'), total: true },
        { key: 'remark', title: 'Remark', width: 180, value: v('remark') },
        { key: 'note', title: 'หมายเหตุ / ผู้เบิก', width: 200, value: v('note') },
      ]
    case 'transfers':
      return [
        ...head, ...wine,
        { key: 'from', title: 'จาก (คลัง · Rack)', width: 190, value: v('from') },
        { key: 'to', title: 'ไป (คลัง · Rack)', width: 190, value: v('to') },
        { key: 'qty', title: 'จำนวน (ขวด)', width: 100, kind: 'int', value: v('qty'), total: true },
        { key: 'remark', title: 'Remark', width: 180, value: v('remark') },
      ]
    case 'adjustments':
      return [
        ...head, ...wine, ...place,
        { key: 'before', title: 'ในระบบ', width: 90, kind: 'int', value: v('before') },
        { key: 'after', title: 'นับได้จริง', width: 100, kind: 'int', value: v('after') },
        { key: 'diff', title: 'ผลต่าง', width: 90, kind: 'int', value: v('diff'), total: true },
        { key: 'reason', title: 'สาเหตุ', width: 150, value: v('reason') },
        { key: 'remark', title: 'Remark', width: 180, value: v('remark') },
      ]
  }
}

const TAB_LABEL: Record<DocTab, string> = { receipts: 'รับเข้า', sales: 'ขาย', withdrawals: 'เบิก', transfers: 'โอนย้าย', adjustments: 'ปรับยอด' }

/** ยอดเงินที่ต้องหารต่อขวด (ขวดสุดท้ายรับเศษสตางค์ ให้รวมแล้วเท่ายอดเดิม) */
const SPLIT_MONEY: Record<DocTab, string[]> = {
  receipts: ['value'],
  sales: ['before', 'vat', 'total'],
  withdrawals: [],
  transfers: [],
  adjustments: [],
}

/** แตกบรรทัดเป็นรายขวด: รับ 5 ขวด = 5 แถว แต่ละแถวบอกที่เก็บของขวดนั้น */
function perBottle(tab: DocTab, lines: Line[]): Line[] {
  return lines.flatMap((l) => {
    const raw = Number(tab === 'adjustments' ? l.diff : l.qty) || 0
    const n = Math.abs(raw)
    if (n <= 1) return [{ ...l, unit: n ? '1/1' : '–' }]
    return Array.from({ length: n }, (_, i) => {
      const row: Line = { ...l, _id: `${l._id}:${i}`, unit: `${i + 1}/${n}` }
      if (tab === 'adjustments') row.diff = Math.sign(raw)
      else row.qty = 1
      for (const k of SPLIT_MONEY[tab]) {
        const v = l[k]
        if (typeof v !== 'number') continue
        const each = Math.round((v / n) * 100) / 100
        row[k] = i === n - 1 ? Math.round((v - each * (n - 1)) * 100) / 100 : each
      }
      return row
    })
  })
}

/** รายละเอียดเอกสาร มุมมอง "รายขวด": แยกทีละขวด เห็นที่เก็บของแต่ละขวด กรอง/เรียง/ส่งออกได้ */
export function DocLinesGrid({ tab, doc, stores }: { tab: DocTab; doc: Record<string, any>; stores: Store[] }) {
  const lines = useMemo(() => perBottle(tab, docLines(tab, [doc], stores)), [tab, doc, stores])
  // หัวเอกสาร (วันที่ เลขที่ สถานะ ลูกค้า) เหมือนกันทุกบรรทัด — ไม่ต้องซ้ำในตาราง · ยอดก่อน/หลังปรับยอดเป็นของทั้งบรรทัด
  const defs = useMemo<Def<Line>[]>(
    () => [
      { key: 'unit', title: 'ขวดที่', width: 70, value: v('unit') },
      ...lineDefs(tab).filter(
        (d) => !['date', 'doc_no', 'status', 'customer', 'note'].includes(d.key) && !(tab === 'adjustments' && (d.key === 'before' || d.key === 'after')),
      ),
    ],
    [tab],
  )
  const columns = useMemo(() => toGrid(defs), [defs])
  const [exporting, setExporting] = useState(false)

  async function exportFile() {
    setExporting(true)
    try {
      await exportXlsx({
        fileName: `${doc.doc_no}-รายขวด.xlsx`,
        sheets: [{ name: doc.doc_no, title: `${TAB_LABEL[tab]} ${doc.doc_no}`, subtitle: doc.note ?? undefined, columns: toXlsx(defs), rows: lines }],
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">แยกทีละขวด {fmtInt(lines.length)} ขวด · คลิกหัวคอลัมน์เพื่อกรอง/เรียง เช่น เรียงตาม Store / Wine racks</span>
        <ExportButton size="sm" className="ml-auto" onClick={exportFile} loading={exporting} />
      </div>
      <DataGrid
        key={tab}
        className="min-h-[320px] flex-1"
        rows={lines}
        columns={columns}
        getRowId={(r) => r._id}
        pageSizeKey={`history-doc-${tab}`}
        card={{
          noun: 'รายการ',
          title: (r) => `${r.wine} ${r.vintage}`,
          subtitle: (r) => `ขวดที่ ${r.unit}`,
          fields: defs.filter((d) => !['wine', 'vintage', 'unit'].includes(d.key)).map((d) => d.key),
        }}
        emptyState="ไม่มีรายการ"
      />
    </div>
  )
}

type DocSummary = {
  doc_no: string
  date: string
  status: 'posted' | 'void'
  party: string | null
  lines: number
  qty: number
  amount: number | null
  note: string | null
  by: string | null
}

/** ส่งออก Excel: แผ่น "ตามเอกสาร" (หัวเอกสารละแถว) + แผ่น "รายรายการ" — ดึงทุกเอกสารในตัวกรอง ไม่ใช่แค่หน้าที่เห็น */
export async function exportDocs(tab: DocTab, filter: DocFilter, stores: Store[]) {
  const opts = {
    receipts: receiptsListOptions,
    sales: salesListOptions,
    withdrawals: withdrawalsListOptions,
    transfers: transfersListOptions,
    adjustments: adjustmentsListOptions,
  }[tab]
  const data = (await queryClient.fetchQuery(opts(1, ALL, filter) as never)) as { items: Array<Record<string, any>> }
  const sum = (ls: Array<Record<string, any>>, f: (l: Record<string, any>) => number) => ls.reduce((n, l) => n + f(l), 0)
  const rows: DocSummary[] = data.items.map((d) => {
    const ls: Array<Record<string, any>> =
      d.receipt_lines ?? d.sale_lines ?? d.withdrawal_lines ?? d.transfer_lines ?? d.stock_adjustment_lines ?? []
    const date = d.received_at ?? d.sold_at ?? d.transferred_at ?? d.adjusted_at ?? ls[0]?.withdraw_date ?? d.created_at.slice(0, 10)
    return {
      doc_no: d.doc_no,
      date,
      status: d.status,
      party: tab === 'sales' ? d.customer : tab === 'receipts' ? d.supplier : null,
      lines: ls.length,
      qty: tab === 'adjustments' ? sum(ls, (l) => l.diff) : sum(ls, (l) => l.qty),
      amount: tab === 'sales' ? d.total : tab === 'receipts' ? sum(ls, (l) => l.qty * (l.price_per_bottle ?? 0)) : null,
      note: d.note,
      by: d.created_by_email,
    }
  })
  const money = tab === 'receipts' || tab === 'sales'
  const defs: Def<DocSummary>[] = [
    { key: 'date', title: 'วันที่', width: 100, kind: 'date', value: (r) => r.date },
    { key: 'doc_no', title: 'เลขที่', width: 120, value: (r) => r.doc_no },
    { key: 'status', title: 'สถานะ', width: 90, value: (r) => STATUS[r.status] },
    ...(tab === 'sales' || tab === 'receipts'
      ? [{ key: 'party', title: tab === 'sales' ? 'ลูกค้า' : 'ซื้อจากใคร', width: 160, value: (r: DocSummary) => r.party } as Def<DocSummary>]
      : []),
    { key: 'lines', title: 'รายการ', width: 80, kind: 'int', value: (r) => r.lines, total: true },
    { key: 'qty', title: tab === 'adjustments' ? 'ผลต่าง (ขวด)' : 'จำนวน (ขวด)', width: 100, kind: 'int', value: (r) => r.qty, total: true },
    ...(money ? [{ key: 'amount', title: 'ยอดเงิน', width: 120, kind: 'money', value: (r: DocSummary) => r.amount, total: true } as Def<DocSummary>] : []),
    { key: 'note', title: 'หมายเหตุ', width: 200, value: (r) => r.note },
    { key: 'by', title: 'บันทึกโดย', width: 170, value: (r) => r.by },
  ]
  await exportXlsx({
    fileName: `ความเคลื่อนไหว-${TAB_LABEL[tab]}-${todayIso()}.xlsx`,
    sheets: [
      { name: TAB_LABEL[tab], title: `${TAB_LABEL[tab]} — ตามเอกสาร`, subtitle: rangeText(filter), columns: toXlsx(defs), rows },
      {
        name: `${TAB_LABEL[tab]} รายรายการ`,
        title: `${TAB_LABEL[tab]} — รายรายการ`,
        subtitle: rangeText(filter),
        columns: toXlsx(lineDefs(tab)),
        rows: docLines(tab, data.items, stores),
      },
    ],
  })
}
