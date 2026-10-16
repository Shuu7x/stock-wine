import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  FileText,
  FileX2,
  Files,
  Layers,
  ListOrdered,
  Printer,
  Rows3,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { ExportButton } from '@/components/ui/export-button'
import { Field, Input } from '@/components/ui/field'
import { FilterChips, type FilterChip } from '@/components/ui/filter-chips'
import { Loading } from '@/components/ui/loading'
import { PageHeader } from '@/components/ui/page'
import { DOC_PAGE_SIZES, Pager } from '@/components/ui/pager'
import { Segmented } from '@/components/ui/segmented'
import { usePrintSaleBill } from '@/features/billing/api/billing.api'
import { BillDialog } from '@/features/billing/components/BillDialog'
import { useVoidAdjustment, useVoidSale, useVoidTransfer } from '@/features/operations/api/operations.api'
import { useVoidReceipt } from '@/features/receipts/api/receipts.api'
import { ReceiptFiles } from '@/features/receipts/components/ReceiptFiles'
import { storesOptions, type Store } from '@/features/stock/api/stock.api'
import { useVoidWithdrawal } from '@/features/withdrawals/api/withdrawals.api'
import { cn } from '@/lib/cn'
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, todayIso } from '@/lib/format'
import {
  DOC_TYPES,
  exportMovements,
  GROUP_BY,
  groupRows,
  MOVE_LIMIT,
  MOVE_TYPES,
  totals,
  TYPE_META,
  useMovements,
  type DocType,
  type GroupBy,
  type MovementRow,
  type MoveType,
} from '../movements'
import { buildDocView, type DocView } from './DocViews'
import { DocLinesGrid } from './MovementTables'

export const HISTORY_VIEWS = ['rows', 'groups', 'docs'] as const
export type HistoryView = (typeof HISTORY_VIEWS)[number]

const VIEWS: Array<{ value: HistoryView; label: string; icon: LucideIcon }> = [
  { value: 'rows', label: 'รายการ', icon: Rows3 },
  { value: 'groups', label: 'จัดกลุ่ม', icon: Layers },
  { value: 'docs', label: 'เอกสาร', icon: Files },
]

const VOID_HINT: Record<DocType, string> = {
  receipts: 'ยอดคงเหลือจะถูกหักกลับตามที่รับเข้า (ทำไม่ได้ถ้าไวน์ถูกเบิกไปแล้วจนเหลือไม่พอ)',
  withdrawals: 'ยอดคงเหลือจะถูกบวกกลับตามที่เบิก',
  sales: 'ยอดคงเหลือจะถูกบวกกลับตามที่ขาย',
  transfers: 'ไวน์จะถูกย้ายกลับไปคลังต้นทาง (ทำไม่ได้ถ้าปลายทางเหลือไม่พอ)',
  adjustments: 'ยอดคงเหลือจะถูกปรับกลับเป็นก่อนปรับยอด',
}

// ─── ช่วงวันที่ (ต้องมีเสมอ — ไม่ดึง "ตั้งแต่แรก") ───────────────────────────────
const iso = (d: Date) => d.toLocaleDateString('sv-SE')
const PRESETS = [
  { key: 'today', label: 'วันนี้', range: () => ({ from: todayIso(), to: todayIso() }) },
  { key: '7d', label: '7 วัน', range: () => ({ from: iso(new Date(Date.now() - 6 * 864e5)), to: todayIso() }) },
  { key: 'month', label: 'เดือนนี้', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: todayIso() } } },
  { key: 'lastMonth', label: 'เดือนก่อน', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) } } },
  { key: '3m', label: '3 เดือน', range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth() - 2, 1)), to: todayIso() } } },
  { key: 'year', label: 'ปีนี้', range: () => ({ from: `${new Date().getFullYear()}-01-01`, to: todayIso() }) },
] as const

/** มุมมองรายละเอียดเอกสารใน drawer — จำค่าที่เลือกล่าสุดไว้ */
type DocMode = 'doc' | 'table'
const DOC_MODE_KEY = 'stock-wine:history-doc-view'
const DOC_MODES: Array<{ value: DocMode; label: string; icon: LucideIcon }> = [
  { value: 'doc', label: 'มุมมองเอกสาร — หัวเอกสาร ไฟล์แนบ และสรุปรายการ', icon: FileText },
  { value: 'table', label: 'มุมมองรายขวด — แยกทีละขวด เห็นที่เก็บของแต่ละขวด', icon: ListOrdered },
]
function loadDocMode(): DocMode {
  try {
    return localStorage.getItem(DOC_MODE_KEY) === 'table' ? 'table' : 'doc'
  } catch {
    return 'doc'
  }
}

const netText = (n: number) => (n > 0 ? `+${fmtInt(n)}` : fmtInt(n))
const NetCell = ({ n }: { n: number }) =>
  n === 0 ? <span className="text-muted">0</span> : <b className={n > 0 ? 'text-success-700' : 'text-danger-700'}>{netText(n)}</b>
const matches = (r: MovementRow, q: string) =>
  !q || [r.wine, r.vintage, r.doc_no, r.party, r.remark, r.store, r.rack, r.kind].some((v) => v?.toLowerCase().includes(q))

export function HistoryPage({
  view,
  initialType,
  onView,
}: {
  view: HistoryView
  /** มาจากหน้าทำรายการ: กรองประเภทนั้นไว้ให้ */
  initialType?: MoveType
  onView: (v: HistoryView) => void
}) {
  const stores = useQuery(storesOptions()).data ?? []
  const [range, setRange] = useState(() => PRESETS[2].range())
  const [types, setTypes] = useState<Set<MoveType>>(() => new Set(initialType ? [initialType] : MOVE_TYPES))
  const [status, setStatus] = useState<'all' | 'posted' | 'void'>('all')
  const [search, setSearch] = useState('')
  const filter = { ...range, status: status === 'all' ? undefined : status }
  const { rows, docs, loading, truncated } = useMovements(types, filter, stores)
  const q = search.trim().toLowerCase()
  const shown = useMemo(() => rows.filter((r) => matches(r, q)), [rows, q])

  const voids = {
    receipts: useVoidReceipt(),
    withdrawals: useVoidWithdrawal(),
    sales: useVoidSale(),
    transfers: useVoidTransfer(),
    adjustments: useVoidAdjustment(),
  }
  const [opened, setOpened] = useState<{ type: DocType; id: string } | null>(null)
  const [billIds, setBillIds] = useState<string[] | null>(null)
  const printBill = usePrintSaleBill()
  const [voiding, setVoiding] = useState<DocView | null>(null)
  const [reason, setReason] = useState('')
  const [exporting, setExporting] = useState(false)
  const [docMode, setDocModeState] = useState<DocMode>(loadDocMode)
  const setDocMode = (m: DocMode) => {
    setDocModeState(m)
    try {
      localStorage.setItem(DOC_MODE_KEY, m)
    } catch {
      /* ไม่จำก็ได้ */
    }
  }

  const openRaw = opened ? docs[opened.type].find((d) => d.id === opened.id) : undefined
  const open = opened && openRaw ? buildDocView(opened.type, openRaw, stores) : null
  const tableMode = docMode === 'table' && !!openRaw
  const openDoc = (type: DocType | null, id: string | null) => type && id && setOpened({ type, id })

  const allTypes = types.size === MOVE_TYPES.length
  const toggleType = (t: MoveType) =>
    setTypes((s) => {
      // จากทั้งหมด กดประเภทไหน = ดูเฉพาะประเภทนั้น
      if (s.size === MOVE_TYPES.length) return new Set([t])
      const n = new Set(s)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n.size ? n : new Set(MOVE_TYPES)
    })
  const typesLabel = allTypes ? 'ทุกประเภท' : MOVE_TYPES.filter((t) => types.has(t)).map((t) => TYPE_META[t].label).join(', ')
  const days = Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 864e5) + 1
  const preset = PRESETS.find((p) => { const r = p.range(); return r.from === range.from && r.to === range.to })?.key

  const chips: FilterChip[] = []
  if (!allTypes) chips.push({ key: 'types', label: 'ประเภท', value: typesLabel, onRemove: () => setTypes(new Set(MOVE_TYPES)) })
  if (status !== 'all') chips.push({ key: 'status', label: 'สถานะ', value: status === 'void' ? 'ยกเลิก' : 'บันทึกแล้ว', onRemove: () => setStatus('all') })
  if (q) chips.push({ key: 'q', label: 'ค้นหา', value: `“${search.trim()}”`, onRemove: () => setSearch('') })

  async function confirmVoid() {
    if (!voiding) return
    await voids[voiding.type].mutateAsync({ id: voiding.id, reason })
    toast.success(`ยกเลิก ${voiding.doc_no} แล้ว ยอดสต็อกถูกปรับกลับ`)
    setVoiding(null)
    setReason('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        title="ความเคลื่อนไหว"
        description="ทุกความเคลื่อนไหวของสต็อกในช่วงวันที่ที่เลือก · กรองตามประเภท · จัดกลุ่มดูยอด · เปิดเอกสารเพื่อยกเลิก/พิมพ์บิล · ส่งออก Excel พร้อมสรุปแบบ pivot"
        actions={
          <ExportButton
            loading={exporting}
            disabled={!shown.length}
            onClick={async () => {
              setExporting(true)
              try {
                await exportMovements(shown, filter, typesLabel)
              } finally {
                setExporting(false)
              }
            }}
          />
        }
      />

      {/* ── ตัวกรอง ── */}
      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="ตั้งแต่วันที่" className="w-40">
            <DateInput value={range.from} max={range.to} onChange={(v) => v && setRange((r) => ({ ...r, from: v }))} />
          </Field>
          <Field label="ถึงวันที่" className="w-40">
            <DateInput value={range.to} max={todayIso()} onChange={(v) => v && setRange((r) => ({ ...r, to: v }))} />
          </Field>
          <div className="flex flex-wrap gap-1 pb-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setRange(p.range())}
                className={cn(
                  'h-9 rounded-lg px-2.5 text-sm font-medium transition',
                  preset === p.key ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-100',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full pb-0.5 sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาไวน์ เลขที่ ลูกค้า …" className="pl-9" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-ink-2">ประเภท</span>
          <button
            type="button"
            onClick={() => setTypes(new Set(MOVE_TYPES))}
            className={cn(
              'h-8 rounded-full px-3 text-sm font-medium transition',
              allTypes ? 'bg-brand-700 text-white' : 'bg-surface text-ink-2 ring-1 ring-line-strong ring-inset hover:bg-surface-2',
            )}
          >
            ทั้งหมด
          </button>
          {MOVE_TYPES.map((t) => {
            const M = TYPE_META[t]
            const on = !allTypes && types.has(t)
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition',
                  on ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-100',
                )}
              >
                <M.icon className="size-3.5" />
                {M.label}
              </button>
            )
          })}
          <span className="mx-1 h-5 w-px bg-line" />
          <Segmented
            className="!mx-0 !px-0"
            value={status}
            onChange={setStatus}
            items={[
              { value: 'all', label: 'ทุกสถานะ' },
              { value: 'posted', label: 'บันทึกแล้ว' },
              { value: 'void', label: 'ยกเลิก' },
            ]}
          />
        </div>
        <FilterChips chips={chips} onClearAll={() => (setTypes(new Set(MOVE_TYPES)), setStatus('all'), setSearch(''))} />
        {(days > 366 || truncated.length > 0) && (
          <p className="flex items-center gap-1.5 text-xs text-warning-700">
            <AlertTriangle className="size-3.5" />
            {truncated.length
              ? `เอกสาร${truncated.map((t) => TYPE_META[t].label).join(', ')}ในช่วงนี้เกิน ${fmtInt(MOVE_LIMIT)} ใบ แสดงเฉพาะล่าสุด — แคบช่วงวันที่ลง`
              : `ช่วงวันที่ยาว ${fmtInt(days)} วัน อาจโหลดช้า — แนะนำทีละเดือนหรือไตรมาส`}
          </p>
        )}
      </div>

      {/* ── มุมมอง ── */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="tablist" aria-label="มุมมอง" className="flex gap-1 rounded-lg bg-brand-50 p-1 ring-1 ring-brand-200 ring-inset">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => onView(v.value)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition',
                view === v.value ? 'bg-brand-700 text-white shadow-sm' : 'text-brand-800 hover:bg-brand-100',
              )}
            >
              <v.icon className="size-4" />
              {v.label}
            </button>
          ))}
        </div>
        <Summary rows={shown} />
      </div>

      {loading ? (
        <Loading screen />
      ) : view === 'rows' ? (
        <RowsTable rows={shown} onOpen={openDoc} />
      ) : view === 'groups' ? (
        <GroupsView rows={status === 'void' ? shown : shown.filter((r) => r.status === 'posted')} onOpen={openDoc} />
      ) : (
        <DocsList docs={docs} stores={stores} q={q} onOpen={openDoc} />
      )}

      {/* ── รายละเอียดเอกสาร ── */}
      <Drawer
        open={!!open}
        wide={tableMode}
        onClose={() => setOpened(null)}
        header={
          open && (
            <DocHeader open={open} docMode={docMode} setDocMode={setDocMode} />
          )
        }
        footer={
          open && (
            <>
              {open.status === 'posted' && (
                <Button variant="ghost" className="text-danger-700" onClick={() => setVoiding(open)}>
                  <Ban className="size-4" /> ยกเลิกเอกสาร
                </Button>
              )}
              <span className="ml-auto" />
              {open.type === 'sales' && (open.billId || open.status === 'posted') && (
                <Button
                  loading={printBill.isPending}
                  onClick={async () => setBillIds([await printBill.billFor({ id: open.id, bill_id: open.billId, customer: open.party })])}
                >
                  <Printer className="size-4" /> พิมพ์บิล
                </Button>
              )}
              <Button onClick={() => setOpened(null)}>ปิด</Button>
            </>
          )
        }
      >
        {open && tableMode && openRaw && (
          <div className="flex h-full min-h-[420px] flex-col gap-3">
            <VoidBanner open={open} compact />
            <DocLinesGrid tab={open.type} doc={openRaw} stores={stores} />
          </div>
        )}
        {open && !tableMode && <DocDetail open={open} />}
      </Drawer>

      <BillDialog billIds={billIds} onClose={() => setBillIds(null)} />

      <Dialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title={`ยกเลิกเอกสาร ${voiding?.doc_no ?? ''}?`}
        description={voiding ? `${VOID_HINT[voiding.type]} · เอกสารยังเก็บไว้ในประวัติ` : undefined}
        footer={
          <>
            <Button onClick={() => setVoiding(null)}>ไม่ยกเลิก</Button>
            <Button variant="danger" loading={!!voiding && voids[voiding.type].isPending} onClick={confirmVoid}>
              ยืนยันยกเลิก
            </Button>
          </>
        }
      >
        <Field label="เหตุผล">
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น บันทึกซ้ำ / กรอกจำนวนผิด" />
        </Field>
      </Dialog>
    </div>
  )
}

/** ยอดรวมของสิ่งที่แสดงอยู่ */
function Summary({ rows }: { rows: MovementRow[] }) {
  const t = totals(rows.filter((r) => r.status === 'posted'))
  return (
    <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2 tabular-nums">
      <span>
        <b className="text-ink">{fmtInt(rows.length)}</b> รายการ
      </span>
      <span>
        เข้า <b className="text-success-700">{fmtInt(t.qty_in)}</b>
      </span>
      <span>
        ออก <b className="text-danger-700">{fmtInt(t.qty_out)}</b>
      </span>
      <span>
        สุทธิ <NetCell n={t.net} /> ขวด
      </span>
      {t.sales > 0 && (
        <span>
          ยอดขาย <b className="text-brand-800">{fmtMoney(t.sales)}</b>
        </span>
      )}
    </div>
  )
}

// ─── มุมมองรายการ ───────────────────────────────────────────────────────────
function RowsTable({ rows, onOpen }: { rows: MovementRow[]; onOpen: (t: DocType | null, id: string | null) => void }) {
  const columns = useMemo<GridColumn<MovementRow>[]>(
    () => [
      { key: 'date', title: 'วันที่', width: 100, readOnly: true, align: 'center', format: (v) => fmtDate(String(v)) },
      {
        key: 'kind',
        title: 'ประเภท',
        width: 120,
        readOnly: true,
        render: (r) => <Badge tone={TYPE_META[r.type].tone}>{r.kind}</Badge>,
      },
      {
        key: 'doc_no',
        title: 'เอกสาร',
        width: 130,
        readOnly: true,
        render: (r) =>
          r.doc_no ? (
            <button
              type="button"
              onClick={() => onOpen(r.doc_type, r.doc_id)}
              className={cn('font-mono text-brand-700 hover:underline', r.status === 'void' && 'line-through')}
              title="เปิดเอกสาร"
            >
              {r.doc_no}
            </button>
          ) : null,
      },
      { key: 'wine', title: 'Name of wine', width: 260, readOnly: true, frozen: true },
      { key: 'vintage', title: 'Year', width: 70, readOnly: true, align: 'center' },
      { key: 'store', title: 'Store', width: 150, readOnly: true },
      { key: 'rack', title: 'Wine racks', width: 100, readOnly: true },
      { key: 'qty_in', title: 'เข้า', subtitle: 'ขวด', width: 70, readOnly: true, type: 'number', align: 'right', format: (v) => (v ? fmtInt(v as number) : '') },
      { key: 'qty_out', title: 'ออก', subtitle: 'ขวด', width: 70, readOnly: true, type: 'number', align: 'right', format: (v) => (v ? fmtInt(v as number) : '') },
      { key: 'net', title: 'สุทธิ', subtitle: 'ขวด', width: 76, readOnly: true, type: 'number', align: 'right', render: (r) => <NetCell n={r.net} /> },
      { key: 'amount', title: 'ยอดเงิน', subtitle: 'รับเข้า = มูลค่าซื้อ · ขาย = ยอดขาย', width: 130, readOnly: true, type: 'number', align: 'right', format: (v) => (v == null ? '' : fmtMoney(v as number)) },
      { key: 'party', title: 'ลูกค้า / ผู้ขาย', width: 160, readOnly: true },
      { key: 'remark', title: 'หมายเหตุ', width: 260, readOnly: true },
      { key: 'by', title: 'ผู้ทำรายการ', width: 170, readOnly: true },
      {
        key: 'status',
        title: 'สถานะ',
        width: 96,
        readOnly: true,
        get: (r) => (r.status === 'void' ? 'ยกเลิก' : 'บันทึกแล้ว'),
        render: (r) => (r.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>),
      },
    ],
    [onOpen],
  )
  return (
    <DataGrid
      className="min-h-[360px] flex-1"
      rows={rows}
      columns={columns}
      getRowId={(r) => r._id}
      pageSizeKey="history-moves"
      rowClassName={(r) => (r.status === 'void' ? 'text-muted' : undefined)}
      card={{
        noun: 'รายการ',
        title: (r) => `${r.wine} ${r.vintage}`,
        subtitle: (r) => [fmtDate(r.date), r.kind, r.doc_no, `${r.store} · ${r.rack ?? '-'}`].filter(Boolean).join(' · '),
        fields: ['net', 'amount', 'party', 'remark'],
      }}
      emptyState={
        <span className="flex flex-col items-center gap-2">
          <FileX2 className="size-10 text-line-strong" /> ไม่มีความเคลื่อนไหวในช่วงนี้
        </span>
      }
    />
  )
}

// ─── มุมมองจัดกลุ่ม ─────────────────────────────────────────────────────────
const GROUP_OPTIONS = (Object.keys(GROUP_BY) as GroupBy[]).map((k) => ({ value: k, label: GROUP_BY[k].label }))

function GroupsView({ rows, onOpen }: { rows: MovementRow[]; onOpen: (t: DocType | null, id: string | null) => void }) {
  const [by, setBy] = useState<GroupBy>('kind')
  const [sub, setSub] = useState<GroupBy | 'none'>('wine')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const groups = useMemo(() => groupRows(rows, by), [rows, by])
  const all = totals(rows)
  const toggle = (k: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const grid = 'grid grid-cols-[minmax(0,1fr)_64px_64px_64px_72px_110px_110px] items-center gap-2'

  return (
    <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-sm">
        <span className="text-ink-2">จัดกลุ่มตาม</span>
        <Combobox className="w-44" value={by} onChange={(v) => (setBy(v), setExpanded(new Set()))} options={GROUP_OPTIONS} />
        <span className="text-ink-2">แยกย่อยตาม</span>
        <Combobox
          className="w-44"
          value={sub}
          onChange={setSub}
          options={[{ value: 'none' as const, label: '— แสดงรายการ —' }, ...GROUP_OPTIONS.filter((o) => o.value !== by)]}
        />
        <button type="button" className="ml-auto text-xs font-medium text-brand-700 hover:underline" onClick={() => setExpanded(expanded.size ? new Set() : new Set(groups.map((g) => g.key)))}>
          {expanded.size ? 'ยุบทั้งหมด' : 'ขยายทั้งหมด'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[760px]">
          <div className={cn(grid, 'sticky top-0 z-10 border-b border-line bg-surface-3 px-3 py-2 text-xs font-semibold text-ink-2')}>
            <span>{GROUP_BY[by].label}</span>
            <span className="text-right">รายการ</span>
            <span className="text-right">เข้า</span>
            <span className="text-right">ออก</span>
            <span className="text-right">สุทธิ</span>
            <span className="text-right">มูลค่ารับเข้า</span>
            <span className="text-right">ยอดขาย</span>
          </div>
          {groups.length === 0 && <div className="p-12 text-center text-sm text-muted">ไม่มีความเคลื่อนไหวในช่วงนี้</div>}
          {groups.map((g) => {
            const isOpen = expanded.has(g.key)
            return (
              <div key={g.key} className="border-b border-line">
                <button type="button" onClick={() => toggle(g.key)} className={cn(grid, 'w-full px-3 py-2 text-left text-sm hover:bg-brand-50/50', isOpen && 'bg-brand-50/40')}>
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {isOpen ? <ChevronDown className="size-4 shrink-0 text-brand-700" /> : <ChevronRight className="size-4 shrink-0 text-muted" />}
                    <span className="truncate">{g.label}</span>
                  </span>
                  <GroupNums g={g} />
                </button>
                {isOpen &&
                  (sub === 'none' ? (
                    <ul className="bg-surface-2/40 pb-1">
                      {g.rows.map((r) => (
                        <li key={r._id} className={cn(grid, 'px-3 py-1.5 pl-9 text-xs', r.status === 'void' && 'text-muted line-through')}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 text-muted tabular-nums">{fmtDate(r.date)}</span>
                            <Badge tone={TYPE_META[r.type].tone}>{r.kind}</Badge>
                            {r.doc_no && (
                              <button type="button" onClick={() => onOpen(r.doc_type, r.doc_id)} className="shrink-0 font-mono text-brand-700 hover:underline">
                                {r.doc_no}
                              </button>
                            )}
                            <span className="truncate">
                              {r.wine} {r.vintage} · {r.store} · {r.rack ?? '-'}
                            </span>
                          </span>
                          <span />
                          <span className="text-right tabular-nums">{r.qty_in || ''}</span>
                          <span className="text-right tabular-nums">{r.qty_out || ''}</span>
                          <span className="text-right">
                            <NetCell n={r.net} />
                          </span>
                          <span className="text-right tabular-nums">{r.type === 'receipts' && r.amount != null ? fmtMoney(r.amount) : ''}</span>
                          <span className="text-right tabular-nums">{r.type === 'sales' && r.amount != null ? fmtMoney(r.amount) : ''}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="bg-surface-2/40 pb-1">
                      {groupRows(g.rows, sub).map((s) => (
                        <li key={s.key} className={cn(grid, 'px-3 py-1.5 pl-9 text-sm')}>
                          <span className="truncate text-ink-2">{s.label}</span>
                          <GroupNums g={s} />
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            )
          })}
          {groups.length > 0 && (
            <div className={cn(grid, 'sticky bottom-0 border-t-2 border-line-strong bg-surface-3 px-3 py-2 text-sm font-semibold')}>
              <span>รวม {fmtInt(groups.length)} กลุ่ม</span>
              <GroupNums g={{ rows, ...all }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupNums({ g }: { g: { rows: MovementRow[]; qty_in: number; qty_out: number; net: number; amount: number; sales: number } }) {
  return (
    <>
      <span className="text-right text-ink-2 tabular-nums">{fmtInt(g.rows.length)}</span>
      <span className="text-right tabular-nums">{g.qty_in ? fmtInt(g.qty_in) : ''}</span>
      <span className="text-right tabular-nums">{g.qty_out ? fmtInt(g.qty_out) : ''}</span>
      <span className="text-right">
        <NetCell n={g.net} />
      </span>
      <span className="text-right tabular-nums">{g.amount - g.sales ? fmtMoney(g.amount - g.sales) : ''}</span>
      <span className="text-right font-medium text-brand-800 tabular-nums">{g.sales ? fmtMoney(g.sales) : ''}</span>
    </>
  )
}

// ─── มุมมองเอกสาร ───────────────────────────────────────────────────────────
function DocsList({
  docs,
  stores,
  q,
  onOpen,
}: {
  docs: ReturnType<typeof useMovements>['docs']
  stores: Store[]
  q: string
  onOpen: (t: DocType | null, id: string | null) => void
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const list = useMemo(
    () =>
      DOC_TYPES.flatMap((t) => docs[t].map((d) => buildDocView(t, d, stores)))
        .filter((d) => !q || [d.doc_no, d.party, d.note].some((v) => v?.toLowerCase().includes(q)))
        .sort((a, b) => (a.date === b.date ? (a.created_at < b.created_at ? 1 : -1) : a.date < b.date ? 1 : -1)),
    [docs, stores, q],
  )
  const start = pageSize ? (page - 1) * pageSize : 0
  const pageItems = pageSize ? list.slice(start, start + pageSize) : list
  const cols = 'md:grid-cols-[minmax(150px,1fr)_96px_100px_minmax(0,2fr)_120px_120px_96px_16px]'

  return (
    <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className={cn('hidden shrink-0 gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted md:grid', cols)}>
        <span>เลขที่</span>
        <span>ประเภท</span>
        <span>วันที่</span>
        <span>ลูกค้า / ผู้ขาย / หมายเหตุ</span>
        <span className="text-right">จำนวน</span>
        <span className="text-right">ยอดเงิน</span>
        <span>สถานะ</span>
        <span />
      </div>
      {list.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted">
          <FileX2 className="size-10 text-line-strong" /> ไม่มีเอกสารในช่วงนี้
        </div>
      )}
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
        {pageItems.map((d) => {
          const M = TYPE_META[d.type]
          return (
            <li key={`${d.type}:${d.id}`}>
              <button
                type="button"
                onClick={() => onOpen(d.type, d.id)}
                className={cn(
                  'grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition hover:bg-brand-50/50',
                  cols,
                  d.status === 'void' && 'text-muted',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', d.status === 'void' ? 'bg-surface-3 text-muted' : 'bg-brand-50 text-brand-700')}>
                    <M.icon className="size-4" />
                  </span>
                  <span className={cn('truncate font-mono font-semibold', d.status === 'void' && 'line-through')}>{d.doc_no}</span>
                  {d.status === 'void' && (
                    <Badge tone="danger" className="md:hidden">
                      ยกเลิก
                    </Badge>
                  )}
                </span>
                <span className="hidden md:block">
                  <Badge tone={M.tone}>{M.label}</Badge>
                </span>
                <span className="text-right text-ink-2 md:text-left">{fmtDate(d.date)}</span>
                <span className="col-span-2 min-w-0 truncate md:col-span-1">
                  {d.party && <span className="font-medium text-ink">{d.party}</span>}
                  {d.party && d.note && <span className="text-muted"> · </span>}
                  <span className="text-muted">{d.note ?? (d.party ? '' : '–')}</span>
                </span>
                <span className="text-ink-2 md:text-right">
                  {d.lineCount} รายการ · {d.qty}
                </span>
                <span className="text-right font-semibold tabular-nums">{d.amount != null ? fmtMoney(d.amount) : ''}</span>
                <span className="hidden md:block">
                  {d.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>}
                </span>
                <ChevronRight className="hidden size-4 text-muted md:block" />
              </button>
            </li>
          )
        })}
      </ul>
      {list.length > 0 && (
        <Pager
          className="shrink-0 justify-end border-t border-line bg-surface-2 px-4 py-2"
          page={page}
          pageSize={pageSize}
          total={list.length}
          unit="เอกสาร"
          options={DOC_PAGE_SIZES}
          onPage={setPage}
          onPageSize={(n) => (setPageSize(n), setPage(1))}
        />
      )}
    </div>
  )
}

// ─── drawer ───────────────────────────────────────────────────────────────
function DocHeader({ open, docMode, setDocMode }: { open: DocView; docMode: DocMode; setDocMode: (m: DocMode) => void }) {
  const M = TYPE_META[open.type]
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-gold-100">
        <M.icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-mono text-lg font-bold', open.status === 'void' && 'line-through')}>{open.doc_no}</span>
          {open.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>}
        </div>
        <div className="text-sm text-muted">
          {M.label} · {fmtDate(open.date)}
          {open.party ? ` · ${open.party}` : ''}
        </div>
      </div>
      <div role="tablist" aria-label="มุมมอง" className="ml-auto flex shrink-0 gap-1 rounded-lg bg-brand-50 p-1 ring-1 ring-brand-200 ring-inset">
        {DOC_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={docMode === m.value}
            aria-label={m.label}
            title={m.label}
            onClick={() => setDocMode(m.value)}
            className={cn(
              'flex size-8 items-center justify-center rounded-md transition',
              docMode === m.value ? 'bg-brand-700 text-white shadow-sm' : 'text-brand-700 hover:bg-brand-100',
            )}
          >
            <m.icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  )
}

function VoidBanner({ open, compact }: { open: DocView; compact?: boolean }) {
  if (open.status !== 'void') return null
  return (
    <div className={cn('rounded-lg border border-danger-600/20 bg-danger-50 px-4 text-sm text-danger-700', compact ? 'py-2' : 'py-3')}>
      ยกเลิกเมื่อ {fmtDateTime(open.voided_at)}
      {open.void_reason ? ` — ${open.void_reason}` : ''}
    </div>
  )
}

function DocDetail({ open }: { open: DocView }): ReactNode {
  return (
    <div className="flex flex-col gap-5">
      <VoidBanner open={open} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {open.meta.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="truncate font-medium">{v}</dd>
          </div>
        ))}
        {open.note && (
          <div className="col-span-2">
            <dt className="text-xs text-muted">หมายเหตุ</dt>
            <dd className="font-medium">{open.note}</dd>
          </div>
        )}
      </dl>

      {open.type === 'receipts' && <ReceiptFiles receiptId={open.id} />}

      <div>
        <h3 className="mb-2 text-sm font-semibold">
          รายการ ({open.lineCount}) · {open.qty}
        </h3>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                {open.cols.map((c, i) => (
                  <th key={i} className={cn('px-3 py-2 font-medium', c.right && 'text-right')}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {open.lines.map((cells, i) => (
                <tr key={i} className="align-top">
                  <td className="px-3 py-2 text-muted tabular-nums">{i + 1}</td>
                  {cells.map((cell, j) => (
                    <td key={j} className={cn('px-3 py-2', open.cols[j]?.right && 'text-right tabular-nums')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {open.footer && (
              <tfoot>
                <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                  <td />
                  {open.footer.map((cell, j) => (
                    <td key={j} className={cn('px-3 py-2', open.cols[j]?.right && 'text-right tabular-nums')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
