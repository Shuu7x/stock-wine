/**
 * ความเคลื่อนไหวของสต็อก "ทุกประเภทในตารางเดียว"
 * แปลงบรรทัดเอกสาร (รับเข้า ขาย เบิก โอนย้าย ปรับยอด) + บันทึกแก้ไขข้อมูล → MovementRow
 * ใช้ทั้งตารางรายการ · จัดกลุ่ม · ส่งออก Excel (ข้อมูล + สรุปแบบ pivot)
 */
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, ClipboardCheck, GlassWater, PackagePlus, PencilLine, ShoppingBag, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { adjustmentsListOptions, salesListOptions, transfersListOptions } from '@/features/operations/api/operations.api'
import { receiptsListOptions } from '@/features/receipts/api/receipts.api'
import type { Store } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { withdrawalsListOptions } from '@/features/withdrawals/api/withdrawals.api'
import { exportXlsx, type XlsxColumn, type XlsxSheet } from '@/lib/export-xlsx'
import { fmtDate } from '@/lib/format'
import { logsTableOptions, type StockItemLog } from './api/logs.api'
import { actionOf, FIELD_LABELS, fmtField } from './components/LogList'
import type { RawDoc } from './components/DocViews'

export const DOC_TYPES = ['receipts', 'sales', 'withdrawals', 'transfers', 'adjustments'] as const
export type DocType = (typeof DOC_TYPES)[number]
export const MOVE_TYPES = [...DOC_TYPES, 'edits'] as const
export type MoveType = (typeof MOVE_TYPES)[number]

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'gold'
export const TYPE_META: Record<MoveType, { label: string; icon: LucideIcon; tone: Tone }> = {
  receipts: { label: 'รับเข้า', icon: PackagePlus, tone: 'gold' },
  sales: { label: 'ขาย', icon: ShoppingBag, tone: 'brand' },
  withdrawals: { label: 'เบิก', icon: GlassWater, tone: 'brand' },
  transfers: { label: 'โอนย้าย', icon: ArrowLeftRight, tone: 'info' },
  adjustments: { label: 'ปรับยอด', icon: ClipboardCheck, tone: 'warning' },
  edits: { label: 'แก้ไขข้อมูล', icon: PencilLine, tone: 'neutral' },
}

/** หนึ่งความเคลื่อนไหว (บรรทัดเอกสาร · โอนย้ายแยกเป็นโอนออก/โอนเข้า) */
export type MovementRow = {
  _id: string
  type: MoveType
  /** ชื่อรายการ เช่น รับเข้า · ขาย · โอนออก · โอนเข้า · ปรับยอด · แก้ไข */
  kind: string
  status: 'posted' | 'void'
  /** yyyy-mm-dd */
  date: string
  doc_type: DocType | null
  doc_id: string | null
  doc_no: string | null
  wine: string
  vintage: string
  store: string
  rack: string | null
  qty_in: number
  qty_out: number
  /** + เข้า / − ออก */
  net: number
  /** รับเข้า = มูลค่าซื้อ (ขวด × ราคา/ขวด) · ขาย = ยอดรวม · อื่นๆ = ว่าง */
  amount: number | null
  /** ลูกค้า / ผู้ขาย / ผู้เบิก */
  party: string | null
  remark: string | null
  by: string | null
}

const ALL = 1000 // เอกสารต่อประเภทต่อครั้ง
export const MOVE_LIMIT = ALL

export type MoveFilter = { from: string; to: string; status?: 'posted' | 'void' }

const byNo = <T extends { line_no: number }>(ls: T[]) => [...ls].sort((a, b) => a.line_no - b.line_no)
const localDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE')
const nv = (v: number | null) => (v == null ? 'NV' : String(v))

function rowsOfDoc(type: DocType, raw: RawDoc, stores: Store[]): MovementRow[] {
  const sn = (id: number) => storeName(stores, id)
  const head = (d: { id: string; doc_no: string; status: 'posted' | 'void'; created_by_email: string | null }) => ({
    status: d.status,
    doc_type: type,
    doc_id: d.id,
    doc_no: d.doc_no,
    by: d.created_by_email,
  })
  const d = raw as Record<string, any>
  switch (type) {
    case 'receipts':
      return byNo(d.receipt_lines as any[]).map((l) => ({
        ...head(d as any), _id: l.id, type, kind: l.is_new_item ? 'รับเข้า (ใหม่)' : 'รับเข้า', date: d.received_at,
        wine: l.wine_name, vintage: nv(l.vintage), store: sn(l.store_id), rack: l.rack,
        qty_in: l.qty, qty_out: 0, net: l.qty, amount: l.price_per_bottle == null ? null : l.qty * l.price_per_bottle,
        party: l.supplier ?? d.supplier, remark: l.remark,
      }))
    case 'sales':
      return byNo(d.sale_lines as any[]).map((l) => ({
        ...head(d as any), _id: l.id, type, kind: 'ขาย', date: d.sold_at,
        wine: l.wine_name, vintage: nv(l.vintage), store: sn(l.store_id), rack: l.rack,
        qty_in: 0, qty_out: l.qty, net: -l.qty, amount: l.line_total, party: d.customer, remark: l.remark,
      }))
    case 'withdrawals':
      return byNo(d.withdrawal_lines as any[]).map((l) => ({
        ...head(d as any), _id: l.id, type, kind: 'เบิก', date: l.withdraw_date ?? localDate(d.created_at),
        wine: l.wine_name, vintage: nv(l.vintage), store: sn(l.store_id), rack: l.rack,
        qty_in: 0, qty_out: l.qty, net: -l.qty, amount: null, party: d.note, remark: l.remark,
      }))
    case 'transfers':
      return byNo(d.transfer_lines as any[]).flatMap((l) => [
        {
          ...head(d as any), _id: `${l.id}:out`, type, kind: 'โอนออก', date: d.transferred_at,
          wine: l.wine_name, vintage: nv(l.vintage), store: sn(l.from_store_id), rack: l.from_rack,
          qty_in: 0, qty_out: l.qty, net: -l.qty, amount: null, party: null,
          remark: [`ไป ${sn(l.to_store_id)} · ${l.to_rack ?? '-'}`, l.remark].filter(Boolean).join(' · '),
        },
        {
          ...head(d as any), _id: `${l.id}:in`, type, kind: 'โอนเข้า', date: d.transferred_at,
          wine: l.wine_name, vintage: nv(l.vintage), store: sn(l.to_store_id), rack: l.to_rack,
          qty_in: l.qty, qty_out: 0, net: l.qty, amount: null, party: null,
          remark: [`จาก ${sn(l.from_store_id)} · ${l.from_rack ?? '-'}`, l.remark].filter(Boolean).join(' · '),
        },
      ])
    case 'adjustments':
      return byNo(d.stock_adjustment_lines as any[]).map((l) => ({
        ...head(d as any), _id: l.id, type, kind: l.diff >= 0 ? 'ปรับยอด (+)' : 'ปรับยอด (−)', date: d.adjusted_at,
        wine: l.wine_name, vintage: nv(l.vintage), store: sn(l.store_id), rack: l.rack,
        qty_in: Math.max(0, l.diff), qty_out: Math.max(0, -l.diff), net: l.diff, amount: null, party: null,
        remark: [l.reason, `${l.balance_before} → ${l.balance_after}`, l.remark].filter(Boolean).join(' · '),
      }))
  }
}

/** บันทึกแก้ไขข้อมูลไวน์ (เพิ่มใหม่ / แก้ไข / ลบ / กู้คืน) — ไม่เปลี่ยนยอด */
const EDIT_ACTIONS = new Set(['create', 'update', 'delete', 'restore'])
function rowOfEdit(l: StockItemLog, stores: Store[]): MovementRow {
  const detail = Object.entries(l.changes)
    .filter(([k]) => k !== 'deleted_at' && k !== 'balance')
    .map(([k, ch]) => `${FIELD_LABELS[k] ?? k}: ${fmtField(stores, k, ch.old)} → ${fmtField(stores, k, ch.new)}`)
    .join(' · ')
  return {
    _id: `log:${l.id}`, type: 'edits', kind: actionOf(l).label, status: 'posted', date: localDate(l.created_at),
    doc_type: null, doc_id: null, doc_no: null, wine: l.wine_name, vintage: nv(l.vintage), store: storeName(stores, l.store_id),
    rack: null, qty_in: 0, qty_out: 0, net: 0, amount: null, party: null, remark: detail || null, by: l.created_by_email,
  }
}

/** ดึงทุกประเภทที่เลือกในช่วงวันที่ → แถวความเคลื่อนไหว + เอกสารดิบ (ไว้เปิดรายละเอียด) */
export function useMovements(types: ReadonlySet<MoveType>, f: MoveFilter, stores: Store[]) {
  const df = { from: f.from, to: f.to, status: f.status }
  const q = {
    receipts: useQuery({ ...receiptsListOptions(1, ALL, df), enabled: types.has('receipts') }),
    sales: useQuery({ ...salesListOptions(1, ALL, df), enabled: types.has('sales') }),
    withdrawals: useQuery({ ...withdrawalsListOptions(1, ALL, df), enabled: types.has('withdrawals') }),
    transfers: useQuery({ ...transfersListOptions(1, ALL, df), enabled: types.has('transfers') }),
    adjustments: useQuery({ ...adjustmentsListOptions(1, ALL, df), enabled: types.has('adjustments') }),
  }
  const logs = useQuery({ ...logsTableOptions({ from: f.from, to: f.to }), enabled: types.has('edits') && f.status !== 'void' })

  const docs = useMemo(() => {
    const out = {} as Record<DocType, RawDoc[]>
    for (const t of DOC_TYPES) out[t] = types.has(t) ? ((q[t].data?.items ?? []) as RawDoc[]) : []
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types, q.receipts.data, q.sales.data, q.withdrawals.data, q.transfers.data, q.adjustments.data])

  const rows = useMemo(() => {
    const out: MovementRow[] = []
    for (const t of DOC_TYPES) for (const d of docs[t]) out.push(...rowsOfDoc(t, d, stores))
    if (types.has('edits') && f.status !== 'void')
      for (const l of logs.data ?? []) if (EDIT_ACTIONS.has(l.action)) out.push(rowOfEdit(l, stores))
    return out.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  }, [docs, logs.data, types, stores, f.status])

  const loading = DOC_TYPES.some((t) => types.has(t) && q[t].isLoading) || (types.has('edits') && logs.isLoading)
  /** ประเภทที่เอกสารเกินจำนวนที่ดึง (ควรแคบช่วงวันที่) */
  const truncated = DOC_TYPES.filter((t) => types.has(t) && (q[t].data?.total ?? 0) > ALL)
  return { rows, docs, loading, truncated }
}

// ─── จัดกลุ่ม ───────────────────────────────────────────────────────────────
export const GROUP_BY = {
  kind: { label: 'ประเภท', key: (r: MovementRow) => r.kind },
  wine: { label: 'ไวน์', key: (r: MovementRow) => `${r.wine} ${r.vintage}` },
  store: { label: 'คลัง', key: (r: MovementRow) => r.store },
  place: { label: 'คลัง · ชั้น', key: (r: MovementRow) => `${r.store} · ${r.rack ?? '-'}` },
  month: { label: 'เดือน', key: (r: MovementRow) => r.date.slice(0, 7) },
  day: { label: 'วัน', key: (r: MovementRow) => r.date },
  doc: { label: 'เอกสาร', key: (r: MovementRow) => r.doc_no ?? '(แก้ไขข้อมูล)' },
  party: { label: 'ลูกค้า / ผู้ขาย', key: (r: MovementRow) => r.party ?? '(ไม่ระบุ)' },
} as const
export type GroupBy = keyof typeof GROUP_BY

export type MoveGroup = {
  key: string
  label: string
  rows: MovementRow[]
  qty_in: number
  qty_out: number
  net: number
  amount: number
  /** ยอดขาย (ไว้แยกจากมูลค่ารับเข้า) */
  sales: number
}

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${Number(ym.slice(0, 4)) + 543}`

export function totals(rows: MovementRow[]) {
  let qty_in = 0, qty_out = 0, net = 0, amount = 0, sales = 0
  for (const r of rows) {
    qty_in += r.qty_in
    qty_out += r.qty_out
    net += r.net
    amount += r.amount ?? 0
    if (r.type === 'sales') sales += r.amount ?? 0
  }
  return { qty_in, qty_out, net, amount: Math.round(amount * 100) / 100, sales: Math.round(sales * 100) / 100 }
}

export function groupRows(rows: MovementRow[], by: GroupBy): MoveGroup[] {
  const m = new Map<string, MovementRow[]>()
  for (const r of rows) {
    const k = GROUP_BY[by].key(r)
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  const groups = [...m].map(([key, rs]) => ({
    key,
    label: by === 'month' ? monthLabel(key) : by === 'day' ? fmtDate(key) : key,
    rows: rs,
    ...totals(rs),
  }))
  // วัน/เดือน ล่าสุดก่อน · ที่เหลือเรียงตามชื่อ
  return by === 'month' || by === 'day'
    ? groups.sort((a, b) => (a.key < b.key ? 1 : -1))
    : groups.sort((a, b) => a.label.localeCompare(b.label, 'th', { numeric: true }))
}

// ─── ส่งออก Excel: ข้อมูลดิบ + สรุปแบบ pivot ─────────────────────────────────────
const KIND_ORDER = ['รับเข้า', 'รับเข้า (ใหม่)', 'ขาย', 'เบิก', 'โอนออก', 'โอนเข้า', 'ปรับยอด (+)', 'ปรับยอด (−)']

/** ตาราง pivot: แถว = rowKey · คอลัมน์ = ประเภทรายการ (ขวดสุทธิ) + เข้า/ออก/สุทธิ + ยอดเงิน */
function pivotSheet(name: string, title: string, subtitle: string, rows: MovementRow[], rowTitle: string, rowKey: (r: MovementRow) => string, sortDesc = false): XlsxSheet<Record<string, string | number>> {
  const kinds = KIND_ORDER.filter((k) => rows.some((r) => r.kind === k))
  const m = new Map<string, Record<string, string | number>>()
  for (const r of rows) {
    const k = rowKey(r)
    const o = m.get(k) ?? { _k: k, in: 0, out: 0, net: 0, receive_value: 0, sales: 0, ...Object.fromEntries(kinds.map((x) => [x, 0])) }
    if (r.kind in o) o[r.kind] = (o[r.kind] as number) + r.net
    o.in = (o.in as number) + r.qty_in
    o.out = (o.out as number) + r.qty_out
    o.net = (o.net as number) + r.net
    if (r.type === 'receipts') o.receive_value = (o.receive_value as number) + (r.amount ?? 0)
    if (r.type === 'sales') o.sales = (o.sales as number) + (r.amount ?? 0)
    m.set(k, o)
  }
  const data = [...m.values()].sort((a, b) =>
    sortDesc ? String(b._k).localeCompare(String(a._k)) : String(a._k).localeCompare(String(b._k), 'th', { numeric: true }),
  )
  const int = (header: string, key: string, width = 12): XlsxColumn<Record<string, string | number>> => ({
    header, width, value: (o) => (o[key] as number) || null, numFmt: '#,##0;[Red]-#,##0', align: 'right', total: 'sum',
  })
  const money = (header: string, key: string): XlsxColumn<Record<string, string | number>> => ({
    header, width: 16, value: (o) => (o[key] as number) || null, numFmt: '#,##0.00', align: 'right', total: 'sum',
  })
  return {
    name,
    title,
    subtitle,
    rows: data,
    columns: [
      { header: rowTitle, width: 34, value: (o) => (rowTitle === 'เดือน' ? monthLabel(String(o._k)) : String(o._k)) },
      ...kinds.map((k) => int(k, k)),
      int('เข้ารวม', 'in'),
      int('ออกรวม', 'out'),
      int('สุทธิ (ขวด)', 'net'),
      money('มูลค่ารับเข้า', 'receive_value'),
      money('ยอดขาย', 'sales'),
    ],
  }
}

export async function exportMovements(rows: MovementRow[], f: MoveFilter, typesLabel: string) {
  const range = `ช่วง ${fmtDate(f.from)} – ${fmtDate(f.to)} · ${typesLabel}`
  const posted = rows.filter((r) => r.status === 'posted')
  const note = `${range} · นับเฉพาะเอกสารที่บันทึกแล้ว (ไม่รวมที่ยกเลิก)`
  const dataCols: XlsxColumn<MovementRow>[] = [
    { header: 'วันที่', width: 12, value: (r) => new Date(`${r.date}T00:00:00`), align: 'center' },
    { header: 'เดือน', width: 10, value: (r) => r.date.slice(0, 7), align: 'center' },
    { header: 'ประเภท', width: 12, value: (r) => TYPE_META[r.type].label },
    { header: 'รายการ', width: 14, value: (r) => r.kind },
    { header: 'เลขที่เอกสาร', width: 15, value: (r) => r.doc_no },
    { header: 'สถานะ', width: 11, value: (r) => (r.status === 'void' ? 'ยกเลิก' : 'บันทึกแล้ว') },
    { header: 'ไวน์', width: 34, value: (r) => r.wine },
    { header: 'ปี', width: 7, value: (r) => r.vintage, align: 'center' },
    { header: 'คลัง', width: 18, value: (r) => r.store },
    { header: 'ชั้นวาง', width: 10, value: (r) => r.rack },
    { header: 'เข้า (ขวด)', width: 10, value: (r) => r.qty_in || null, numFmt: '#,##0', align: 'right', total: 'sum' },
    { header: 'ออก (ขวด)', width: 10, value: (r) => r.qty_out || null, numFmt: '#,##0', align: 'right', total: 'sum' },
    { header: 'สุทธิ (ขวด)', width: 11, value: (r) => r.net, numFmt: '#,##0;[Red]-#,##0', align: 'right', total: 'sum' },
    { header: 'ยอดเงิน', width: 14, value: (r) => r.amount, numFmt: '#,##0.00', align: 'right', total: 'sum' },
    { header: 'ลูกค้า / ผู้ขาย / ผู้เบิก', width: 22, value: (r) => r.party },
    { header: 'หมายเหตุ', width: 36, value: (r) => r.remark },
    { header: 'ผู้ทำรายการ', width: 22, value: (r) => r.by },
  ]
  const salesRows = posted.filter((r) => r.type === 'sales')
  await exportXlsx({
    fileName: `ความเคลื่อนไหว-${f.from}-ถึง-${f.to}.xlsx`,
    sheets: [
      { name: 'ข้อมูล', title: 'ความเคลื่อนไหวของสต็อก (ทุกรายการ)', subtitle: `${range} · ทำ PivotTable เพิ่มเองได้จากแผ่นนี้`, columns: dataCols, rows },
      pivotSheet('สรุปตามเดือน', 'สรุปตามเดือน × ประเภท (ขวด)', note, posted, 'เดือน', (r) => r.date.slice(0, 7), true),
      pivotSheet('สรุปตามไวน์', 'สรุปตามไวน์ × ประเภท (ขวด)', note, posted, 'ไวน์', (r) => `${r.wine} ${r.vintage}`),
      pivotSheet('สรุปตามคลัง-ชั้น', 'สรุปตามคลัง · ชั้นวาง × ประเภท (ขวด)', note, posted, 'คลัง · ชั้นวาง', (r) => `${r.store} · ${r.rack ?? '-'}`),
      pivotSheet('สรุปตามลูกค้า', 'ยอดขายตามลูกค้า', note, salesRows, 'ลูกค้า', (r) => r.party ?? '(ไม่ระบุ)'),
    ],
  })
}

