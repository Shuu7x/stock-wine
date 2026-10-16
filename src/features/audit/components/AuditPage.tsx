import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, FilePlus2, FileX2, PencilLine, ScrollText, Search, Trash2, X, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { DATE_PRESETS, DateRangeButton, rangeText } from '@/components/ui/date-range'
import { ExportButton } from '@/components/ui/export-button'
import { Input } from '@/components/ui/field'
import { Loading } from '@/components/ui/loading'
import { PageHeader } from '@/components/ui/page'
import { logsTableOptions, type StockItemLog } from '@/features/history/api/logs.api'
import { actionOf, FIELD_LABELS, fmtField } from '@/features/history/components/LogList'
import { storesOptions } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { cn } from '@/lib/cn'
import { exportXlsx } from '@/lib/export-xlsx'
import { fmtDateTime, fmtInt } from '@/lib/format'

/** กลุ่มการกระทำ (แท็บ) */
const CATS = {
  edit: { label: 'แก้ไขข้อมูล', icon: PencilLine, actions: ['update'] },
  record: { label: 'เพิ่ม / ลบรายการ', icon: Trash2, actions: ['create', 'delete', 'restore'] },
  doc: { label: 'เอกสาร', icon: FilePlus2, actions: ['receive', 'withdraw', 'sale', 'adjust', 'transfer_out', 'transfer_in'] },
  void: { label: 'ยกเลิกเอกสาร', icon: FileX2, actions: ['void_receipt', 'void_withdrawal', 'void_sale', 'void_adjustment', 'void_transfer'] },
} satisfies Record<string, { label: string; icon: LucideIcon; actions: string[] }>
type Cat = keyof typeof CATS
const CAT_KEYS = Object.keys(CATS) as Cat[]
const catOf = (action: string): Cat => CAT_KEYS.find((c) => (CATS[c].actions as string[]).includes(action)) ?? 'edit'

const LIMIT = 3000

type AuditRow = StockItemLog & {
  _label: string
  _cat: Cat
  _store: string
  /** ฟิลด์ที่เปลี่ยน "ชื่อ: เดิม → ใหม่" (ไม่รวมยอด) */
  _detail: string
  /** ยอดคงเหลือ "6 → 8" */
  _balance: string
}

export function AuditPage() {
  const stores = useQuery(storesOptions()).data ?? []
  const [range, setRange] = useState(() => DATE_PRESETS[2].range())
  const [cat, setCat] = useState<Cat | 'all'>('all')
  const [user, setUser] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)
  const q = useQuery(logsTableOptions(range, LIMIT))

  const all = useMemo<AuditRow[]>(
    () =>
      (q.data ?? []).map((l) => {
        const bal = l.changes.balance as { old?: number | null; new?: number | null } | undefined
        return {
          ...l,
          _label: actionOf(l).label,
          _cat: catOf(l.action),
          _store: storeName(stores, l.store_id),
          _detail: Object.entries(l.changes)
            .filter(([k]) => k !== 'deleted_at' && k !== 'balance')
            .map(([k, ch]) => `${FIELD_LABELS[k] ?? k}: ${fmtField(stores, k, ch.old)} → ${fmtField(stores, k, ch.new)}`)
            .join(' · '),
          _balance: bal ? `${bal.old ?? '–'} → ${bal.new ?? '–'}` : '',
        }
      }),
    [q.data, stores],
  )
  const users = useMemo(() => [...new Set(all.map((r) => r.created_by_email ?? '(ไม่ทราบ)'))].sort(), [all])
  const s = search.trim().toLowerCase()
  // ตามผู้ทำ + ค้นหา (ยังไม่กรองกลุ่ม — ไว้นับจำนวนที่แท็บ)
  const base = useMemo(
    () =>
      all.filter(
        (r) =>
          (user === 'all' || (r.created_by_email ?? '(ไม่ทราบ)') === user) &&
          (!s || [r.wine_name, r.ref_doc, r._detail, r._store, r.created_by_email, r._label].some((v) => v?.toLowerCase().includes(s))),
      ),
    [all, user, s],
  )
  const rows = useMemo(() => (cat === 'all' ? base : base.filter((r) => r._cat === cat)), [base, cat])
  const counts = useMemo(() => {
    const c = Object.fromEntries(CAT_KEYS.map((k) => [k, 0])) as Record<Cat, number>
    for (const r of base) c[r._cat]++
    return c
  }, [base])

  const columns = useMemo<GridColumn<AuditRow>[]>(
    () => [
      { key: 'created_at', title: 'วันเวลา', width: 150, readOnly: true, format: (v) => fmtDateTime(String(v)) },
      { key: 'created_by_email', title: 'ผู้ทำ', width: 190, readOnly: true },
      { key: '_label', title: 'การกระทำ', width: 130, readOnly: true, render: (r) => <Badge tone={actionOf(r).tone}>{r._label}</Badge> },
      { key: 'ref_doc', title: 'เอกสาร', width: 120, readOnly: true, render: (r) => (r.ref_doc ? <span className="font-mono">{r.ref_doc}</span> : null) },
      { key: 'wine_name', title: 'Name of wine', width: 250, readOnly: true, frozen: true },
      { key: 'vintage', title: 'Year', width: 70, readOnly: true, align: 'center', get: (r) => r.vintage ?? 'NV' },
      { key: '_store', title: 'Store', width: 150, readOnly: true },
      { key: '_balance', title: 'คงเหลือ', subtitle: 'ก่อน → หลัง', width: 100, readOnly: true, align: 'right' },
      { key: '_detail', title: 'ข้อมูลที่เปลี่ยน', subtitle: 'ก่อน → หลัง', width: 420, readOnly: true },
    ],
    [],
  )

  async function exportFile() {
    setExporting(true)
    try {
      await exportXlsx({
        fileName: `audit-log-${range.from}-ถึง-${range.to}.xlsx`,
        sheets: [
          {
            name: 'Audit log',
            title: 'Audit log — บันทึกการเปลี่ยนแปลงข้อมูลไวน์',
            subtitle: [rangeText(range), cat === 'all' ? 'ทุกการกระทำ' : CATS[cat].label, user === 'all' ? 'ทุกคน' : user].join(' · '),
            rows,
            columns: [
              { header: 'วันเวลา', width: 20, value: (r: AuditRow) => fmtDateTime(r.created_at) },
              { header: 'ผู้ทำ', width: 26, value: (r: AuditRow) => r.created_by_email },
              { header: 'การกระทำ', width: 16, value: (r: AuditRow) => r._label },
              { header: 'เอกสาร', width: 15, value: (r: AuditRow) => r.ref_doc },
              { header: 'ไวน์', width: 34, value: (r: AuditRow) => r.wine_name },
              { header: 'ปี', width: 7, value: (r: AuditRow) => r.vintage ?? 'NV', align: 'center' },
              { header: 'คลัง', width: 18, value: (r: AuditRow) => r._store },
              { header: 'คงเหลือ ก่อน → หลัง', width: 14, value: (r: AuditRow) => r._balance || null, align: 'right' },
              { header: 'ข้อมูลที่เปลี่ยน (ก่อน → หลัง)', width: 60, value: (r: AuditRow) => r._detail || null },
            ],
          },
        ],
      })
    } finally {
      setExporting(false)
    }
  }

  const filtered = cat !== 'all' || user !== 'all' || !!s

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        title="Audit log"
        description="ใครทำอะไรกับข้อมูลไวน์ เมื่อไร · แก้ไขข้อมูล เพิ่ม/ลบรายการ เอกสารที่เปลี่ยนยอด และการยกเลิก พร้อมค่าก่อน → หลัง"
        actions={<ExportButton onClick={exportFile} loading={exporting} disabled={!rows.length} />}
      />

      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeButton value={range} onChange={setRange} presets={DATE_PRESETS} />
          <Combobox
            className="w-60"
            value={user}
            onChange={setUser}
            options={[{ value: 'all', label: 'ทุกคน' }, ...users.map((u) => ({ value: u, label: u }))]}
          />
          {filtered && (
            <button
              type="button"
              onClick={() => (setCat('all'), setUser('all'), setSearch(''))}
              className="flex items-center gap-1 px-1 text-sm font-medium text-brand-700 hover:underline"
            >
              <X className="size-3.5" /> ล้างตัวกรอง
            </button>
          )}
          <label className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาไวน์ เอกสาร ข้อมูลที่เปลี่ยน …" className="pl-9" />
            {search && (
              <button type="button" aria-label="ล้างคำค้นหา" onClick={() => setSearch('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-2">
                <X className="size-3.5" />
              </button>
            )}
          </label>
        </div>
        <div className="no-scrollbar -mx-3 overflow-x-auto px-3">
          <div role="tablist" aria-label="การกระทำ" className="inline-flex gap-1.5">
            <CatTab label="ทั้งหมด" icon={ScrollText} count={base.length} on={cat === 'all'} onClick={() => setCat('all')} />
            {CAT_KEYS.map((k) => (
              <CatTab key={k} label={CATS[k].label} icon={CATS[k].icon} count={counts[k]} on={cat === k} onClick={() => setCat(k)} />
            ))}
          </div>
        </div>
        {(q.data?.length ?? 0) >= LIMIT && (
          <p className="flex items-center gap-1.5 text-xs text-warning-700">
            <AlertTriangle className="size-3.5" /> ช่วงนี้มีบันทึกเกิน {fmtInt(LIMIT)} รายการ แสดงเฉพาะล่าสุด — แคบช่วงวันที่ลง
          </p>
        )}
      </div>

      {q.isLoading ? (
        <Loading screen />
      ) : (
        <DataGrid
          className="min-h-[360px] flex-1"
          rows={rows}
          columns={columns}
          getRowId={(r) => String(r.id)}
          pageSizeKey="audit-log"
          card={{
            noun: 'บันทึก',
            title: (r) => `${r.wine_name} ${r.vintage ?? 'NV'}`,
            subtitle: (r) => [fmtDateTime(r.created_at), r._label, r.ref_doc, r.created_by_email].filter(Boolean).join(' · '),
            fields: ['_store', '_balance', '_detail'],
          }}
          emptyState="ไม่มีบันทึกในช่วงนี้"
        />
      )}
    </div>
  )
}

function CatTab({ label, icon: Icon, count, on, onClick }: { label: string; icon: LucideIcon; count: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
        on ? 'bg-brand-700 text-white shadow-sm' : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-100 hover:ring-brand-300',
        !on && count === 0 && 'opacity-60',
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', on ? 'bg-white/20 text-white' : 'bg-white text-brand-700')}>{fmtInt(count)}</span>
    </button>
  )
}
