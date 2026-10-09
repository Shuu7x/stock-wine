import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Archive, FileSpreadsheet, GlassWater, History, RotateCcw, Save, Search, Undo2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { PageHeader, Stat } from '@/components/ui/page'
import { Segmented } from '@/components/ui/segmented'
import { exportXlsx, type XlsxColumn } from '@/lib/export-xlsx'
import { drinkStatus, fmtDateTime, fmtInt, fmtMaturity, fmtMoney, todayIso } from '@/lib/format'
import {
  stockItemsOptions,
  storesOptions,
  useSaveStockChanges,
  type StockItem,
  type StockItemPatch,
} from '../api/stock.api'
import { ItemHistoryDialog } from '@/features/history/components/LogList'
import { lookupValuesOptions, useAppSettings } from '@/features/settings/api/settings.api'
import { buildLookups, drinkLabel, storeName, wineColumns, wineLabel } from '../columns'

/** 'all' หรือรหัสคลัง (stores.code) — คลังเพิ่ม/แก้ได้ในหน้าตั้งค่า */
export type StoreTab = string

const EDITABLE: Array<keyof StockItemPatch> = [
  'rack',
  'country',
  'wine_name',
  'vintage',
  'rating_rp',
  'rating_ws',
  'maturity_from',
  'maturity_to',
  'price_per_bottle',
  'supplier',
  'purchase_date',
  'remark',
]

function diff(a: StockItem, b: StockItem): StockItemPatch | null {
  const patch: Record<string, unknown> = {}
  for (const k of EDITABLE) if (a[k] !== b[k]) patch[k] = b[k]
  return Object.keys(patch).length ? (patch as StockItemPatch) : null
}

export function StockPage({ tab, onTabChange }: { tab: StoreTab; onTabChange: (t: StoreTab) => void }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [edits, setEdits] = useState<Record<string, StockItem>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // ลบที่พักไว้ (ยังไม่บันทึก) — แสดงเป็นแถวสีแดง
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([])
  const [confirmSave, setConfirmSave] = useState(false)
  const [historyOf, setHistoryOf] = useState<StockItem | null>(null)

  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const save = useSaveStockChanges()

  const stores = useMemo(() => storesQ.data ?? [], [storesQ.data])
  const all = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const live = useMemo(() => all.filter((i) => !i.deleted_at), [all])
  const lookupQ = useQuery(lookupValuesOptions())
  const lookups = useMemo(() => buildLookups(live, lookupQ.data), [live, lookupQ.data])
  const { low_stock_threshold: lowAt } = useAppSettings()
  const isLow = useCallback((b: number) => lowAt > 0 && b > 0 && b <= lowAt, [lowAt])
  const balanceLabel = useCallback((b: number) => (b <= 0 ? 'หมด' : isLow(b) ? 'ใกล้หมด' : 'มีของ'), [isLow])
  const currentStore = stores.find((s) => s.code === tab)

  const serverRows = useMemo(
    () => (currentStore ? all.filter((i) => i.store_id === currentStore.id) : all),
    [all, currentStore],
  )
  const rows = useMemo(() => serverRows.map((r) => edits[r.id] ?? r), [serverRows, edits])
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all])
  const pendingSet = useMemo(() => new Set(pendingDeletes), [pendingDeletes])
  const editCount = Object.keys(edits).filter((id) => !pendingSet.has(id)).length
  const dirty = editCount + pendingDeletes.length > 0

  const cellChanged = useCallback(
    (row: StockItem, key: string) => {
      if (!edits[row.id]) return false
      const orig = byId.get(row.id)
      if (!orig) return false
      const fields = (key === 'maturity' ? ['maturity_from', 'maturity_to'] : [key]) as Array<keyof StockItem>
      return fields.some((f) => orig[f] !== row[f])
    },
    [edits, byId],
  )

  function stageDelete(ids: string[]) {
    const live = ids.filter((id) => !byId.get(id)?.deleted_at)
    if (live.length) setPendingDeletes((p) => [...new Set([...p, ...live])])
  }

  const onRowsChange = useCallback(
    (next: StockItem[]) => {
      setEdits((prev) => {
        const out = { ...prev }
        for (const row of next) {
          const orig = byId.get(row.id)
          if (!orig) continue
          if (diff(orig, row)) out[row.id] = row
          else delete out[row.id]
        }
        return out
      })
    },
    [byId],
  )

  const columns = useMemo(() => {
    const c = wineColumns<StockItem>(stores, lookups)
    const ro = (r: StockItem) => pendingSet.has(r.id)
    const balance: GridColumn<StockItem> = {
      key: 'balance',
      title: 'Balance',
      subtitle: 'คงเหลือ (ขวด)',
      width: 96,
      type: 'number',
      align: 'right',
      readOnly: true,
      // กรองด้วยสถานะคงเหลือแทนตัวเลข
      filterValue: (r) => balanceLabel(r.balance),
      render: (r) => (
        <span className="flex items-center gap-1.5">
          {isLow(r.balance) && <Badge tone="warning">ใกล้หมด</Badge>}
          <span
            className={
              r.balance === 0 ? 'text-muted' : isLow(r.balance) ? 'font-semibold text-warning-700' : 'font-semibold text-brand-800'
            }
          >
            {fmtInt(r.balance)}
          </span>
        </span>
      ),
    }
    const value: GridColumn<StockItem> = {
      key: 'value',
      title: 'มูลค่า',
      subtitle: 'คงเหลือ × ราคา',
      width: 120,
      type: 'number',
      align: 'right',
      readOnly: true,
      get: (r) => (r.price_per_bottle == null ? null : r.balance * r.price_per_bottle),
      format: (v) => fmtMoney(v as number | null),
    }
    const list: GridColumn<StockItem>[] = [
      c.country,
      // ย้ายคลังต้องทำผ่านเบิก/รับเข้า เพื่อให้มีเอกสารรองรับ
      ...(tab === 'all' ? [{ ...c.store, readOnly: true }] : []),
      c.rack,
      c.wine,
      c.vintage,
      balance,
      c.rp,
      c.ws,
      c.maturity,
      c.price,
      value,
      c.supplier,
      c.purchaseDate,
      c.remark,
    ]
    return list.map((col) => ({
      ...col,
      readOnly: col.readOnly === true ? true : ro,
    }))
  }, [stores, lookups, tab, pendingSet, isLow, balanceLabel])

  const stats = useMemo(() => {
    const src = (currentStore ? live.filter((i) => i.store_id === currentStore.id) : live).filter((i) => i.balance > 0)
    const year = new Date().getFullYear()
    return {
      items: src.length,
      low: src.filter((i) => isLow(i.balance)).length,
      bottles: src.reduce((s, i) => s + i.balance, 0),
      value: src.reduce((s, i) => s + i.balance * (i.price_per_bottle ?? 0), 0),
      ready: src.filter((i) => drinkStatus(i.maturity_from, i.maturity_to, year) === 'ready').length,
    }
  }, [live, currentStore, isLow])

  const tabCount = (id?: number) => fmtInt(live.filter((i) => (id ? i.store_id === id : true) && i.balance > 0).length)

  const updates = Object.values(edits)
    .filter((row) => !pendingSet.has(row.id))
    .map((row) => {
      const orig = byId.get(row.id)
      const patch = orig && diff(orig, row)
      return patch ? { id: row.id, patch } : null
    })
    .filter((x) => x !== null)

  function trySave() {
    if (updates.some((c) => c.patch.wine_name !== undefined && !c.patch.wine_name?.trim())) {
      return toast.error('ชื่อไวน์ห้ามว่าง')
    }
    setConfirmSave(true)
  }

  async function submitChanges() {
    await save.mutateAsync({ updates, deletes: pendingDeletes })
    const msg = [updates.length && `แก้ไข ${updates.length}`, pendingDeletes.length && `ลบ ${pendingDeletes.length}`]
      .filter(Boolean)
      .join(' · ')
    setEdits({})
    setPendingDeletes([])
    setConfirmSave(false)
    toast.success(`บันทึกแล้ว (${msg} รายการ)`, { description: 'ดูรายละเอียดได้ที่ ประวัติ › บันทึกการแก้ไข' })
  }

  function discardAll() {
    setEdits({})
    setPendingDeletes([])
  }

  const selectedLive = selectedIds.filter((id) => {
    const r = byId.get(id)
    return r && !r.deleted_at
  })
  const selectedToDelete = selectedLive.filter((id) => !pendingSet.has(id))
  const selectedPending = selectedLive.filter((id) => pendingSet.has(id))
  const selectedWithStock = selectedToDelete.filter((id) => (byId.get(id)?.balance ?? 0) > 0)
  const single = selectedIds.length === 1 ? byId.get(selectedIds[0]) : undefined

  const [exporting, setExporting] = useState(false)

  /** ส่งออก Excel: ข้อมูลที่บันทึกแล้วของแท็บนี้ พร้อมคอลัมน์สถานะไว้กรองใน Excel */
  async function exportExcel() {
    setExporting(true)
    try {
      const data = serverRows.filter((r) => !r.deleted_at)
      const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`) : null)
      const BAL_TONE = { ใกล้หมด: { fill: 'warning-100', font: 'warning-700' }, หมด: { fill: 'surface-3', font: 'muted' } } as const
      const DRINK_TONE = {
        ดื่มได้: { fill: 'success-100', font: 'success-700' },
        ยังไม่ถึง: { fill: 'info-50', font: 'info-600' },
        เลยช่วง: { fill: 'warning-100', font: 'warning-700' },
      } as const
      const cols: XlsxColumn<StockItem>[] = [
        { header: 'Country', width: 14, value: (r) => r.country },
        ...(tab === 'all'
          ? [{ header: 'Store', width: 20, value: (r: StockItem) => storeName(stores, r.store_id) }]
          : []),
        { header: 'Wine racks', width: 11, value: (r) => r.rack, align: 'center' },
        { header: 'Name of wine', width: 40, value: (r) => r.wine_name },
        { header: 'Year', width: 8, value: (r) => r.vintage ?? 'NV', align: 'center' },
        { header: 'Balance', width: 10, value: (r) => r.balance, numFmt: '#,##0', align: 'right', total: 'sum' },
        {
          header: 'สถานะคงเหลือ',
          width: 13,
          value: (r) => balanceLabel(r.balance),
          align: 'center',
          tone: (v) => BAL_TONE[v as keyof typeof BAL_TONE],
        },
        { header: 'RP', width: 7, value: (r) => r.rating_rp, align: 'center' },
        { header: 'WS', width: 7, value: (r) => r.rating_ws, align: 'center' },
        { header: 'Maturity', width: 12, value: (r) => fmtMaturity(r.maturity_from, r.maturity_to) || null, align: 'center' },
        {
          header: 'สถานะการดื่ม',
          width: 13,
          value: (r) => drinkLabel(r.maturity_from, r.maturity_to) || null,
          align: 'center',
          tone: (v) => DRINK_TONE[v as keyof typeof DRINK_TONE],
        },
        { header: 'Price/Btl.', width: 13, value: (r) => r.price_per_bottle, numFmt: '#,##0.00', align: 'right' },
        {
          header: 'มูลค่า',
          width: 15,
          value: (r) => (r.price_per_bottle == null ? null : r.balance * r.price_per_bottle),
          numFmt: '#,##0.00',
          align: 'right',
          total: 'sum',
        },
        { header: 'ซื้อจากใคร', width: 18, value: (r) => r.supplier },
        { header: 'วันที่ซื้อ', width: 12, value: (r) => toDate(r.purchase_date), align: 'center' },
        { header: 'Remark', width: 30, value: (r) => r.remark },
      ]
      const name = currentStore?.name ?? 'All Stock Wines'
      await exportXlsx({
        fileName: `stock-${tab}-${todayIso()}`,
        sheetName: name,
        title: `สต็อกไวน์ · ${name}`,
        subtitle: `ส่งออกเมื่อ ${fmtDateTime(new Date().toISOString())} · ${data.length} รายการ${
          dirty ? ' · (ไม่รวมการแก้ไขที่ยังไม่บันทึก)' : ''
        }`,
        columns: cols,
        rows: data,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title={currentStore?.name ?? 'All Stock Wines'}
        description="ดูและแก้ข้อมูลไวน์ได้ในตาราง · ยอดคงเหลือเปลี่ยนได้ผ่านการรับเข้าและเบิกเท่านั้น"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={exportExcel} loading={exporting}>
              {!exporting && <FileSpreadsheet className="size-4" />} ส่งออก Excel
            </Button>
          </>
        }
      />

      <Segmented
        value={tab}
        onChange={onTabChange}
        items={[
          { value: 'all', label: 'All Stock Wines', count: tabCount() },
          ...stores
            .filter((s) => s.is_active || s.code === tab)
            .map((s) => ({ value: s.code, label: s.name, count: tabCount(s.id) })),
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="รายการที่มีของ"
          value={fmtInt(stats.items)}
          hint={lowAt > 0 ? <span className={stats.low ? 'text-warning-700' : undefined}>ใกล้หมด (≤ {lowAt} ขวด) {fmtInt(stats.low)} รายการ</span> : undefined}
        />
        <Stat label="จำนวนขวดคงเหลือ" value={fmtInt(stats.bottles)} />
        <Stat label="มูลค่ารวม (บาท)" value={fmtMoney(stats.value)} />
        <Stat label="อยู่ในช่วงดื่มได้" value={fmtInt(stats.ready)} hint="ตาม Maturity ปีนี้" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไวน์ ประเทศ rack ผู้ขาย…"
            className="pl-9"
          />
        </label>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {selectedWithStock.length > 0 && (
            <Button
              size="sm"
              onClick={() => navigate({ to: '/withdraw', search: { items: selectedWithStock.join(',') } })}
            >
              <GlassWater className="size-4" /> เบิก {selectedWithStock.length} รายการ
            </Button>
          )}
          {single && (
            <Button size="sm" variant="ghost" onClick={() => setHistoryOf(single)}>
              <History className="size-4" /> ประวัติ
            </Button>
          )}
          {selectedToDelete.length > 0 && (
            <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => stageDelete(selectedToDelete)}>
              <Archive className="size-4" /> ลบ {selectedToDelete.length} รายการ
            </Button>
          )}
          {selectedPending.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPendingDeletes((p) => p.filter((id) => !selectedPending.includes(id)))}
            >
              <RotateCcw className="size-4" /> ยกเลิกการลบ {selectedPending.length} รายการ
            </Button>
          )}
        </div>
      </div>

      {dirty && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-warning-600/30 bg-warning-50 px-4 py-2 text-sm">
          <span className="flex flex-1 flex-wrap items-center gap-x-3 text-warning-700">
            ยังไม่ได้บันทึก:
            {editCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm border border-warning-600/40 bg-warning-100" /> แก้ไข <b>{editCount}</b>
              </span>
            )}
            {pendingDeletes.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm border border-danger-600/40 bg-danger-50" /> ลบ{' '}
                <b>{pendingDeletes.length}</b>
              </span>
            )}
          </span>
          <Button size="sm" variant="ghost" onClick={discardAll}>
            <Undo2 className="size-4" /> ยกเลิกทั้งหมด
          </Button>
          <Button size="sm" variant="primary" onClick={trySave}>
            <Save className="size-4" /> บันทึก
          </Button>
        </div>
      )}

      <DataGrid
        className="min-h-[420px] flex-1"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowsChange={onRowsChange}
        onDeleteRows={stageDelete}
        onSelectionChange={setSelectedIds}
        rowStatus={(r) => (pendingSet.has(r.id) ? 'deleted' : null)}
        cellChanged={cellChanged}
        pageSizeKey="stock"
        search={search}
        emptyState={itemsQ.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีไวน์ในคลังนี้ — เริ่มจากหน้ารับเข้า'}
      />

      <Dialog
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title="ยืนยันบันทึกการเปลี่ยนแปลง"
        description="ทุกการเปลี่ยนแปลงจะถูกเก็บในประวัติ (ใคร · เมื่อไร · ค่าเดิม → ค่าใหม่) รายการที่ลบยังอยู่ในฐานข้อมูลและกู้คืนได้"
        size="lg"
        footer={
          <>
            <Button onClick={() => setConfirmSave(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={save.isPending} onClick={submitChanges}>
              ยืนยันบันทึก
            </Button>
          </>
        }
      >
        {updates.length > 0 && (
          <section className="mb-4">
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <span className="size-3 rounded-sm border border-warning-600/40 bg-warning-100" /> แก้ไข {updates.length} รายการ
            </h3>
            <ul className="space-y-1 text-sm">
              {updates.slice(0, 10).map(({ id, patch }) => {
                const r = byId.get(id)!
                return (
                  <li key={id} className="flex justify-between gap-3">
                    <span className="truncate">{wineLabel(r)}</span>
                    <span className="shrink-0 text-xs text-muted">{Object.keys(patch).length} ช่อง</span>
                  </li>
                )
              })}
              {updates.length > 10 && <li className="text-muted">และอีก {updates.length - 10} รายการ</li>}
            </ul>
          </section>
        )}
        {pendingDeletes.length > 0 && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <span className="size-3 rounded-sm border border-danger-600/40 bg-danger-50" /> ลบ {pendingDeletes.length} รายการ
            </h3>
            <ul className="space-y-1 text-sm">
              {pendingDeletes.slice(0, 10).map((id) => {
                const r = byId.get(id)
                return r ? (
                  <li key={id} className="flex justify-between gap-3">
                    <span className="truncate">{wineLabel(r)}</span>
                    <span className="shrink-0 text-muted">
                      {storeName(stores, r.store_id)} · คงเหลือ {r.balance}
                    </span>
                  </li>
                ) : null
              })}
              {pendingDeletes.length > 10 && <li className="text-muted">และอีก {pendingDeletes.length - 10} รายการ</li>}
            </ul>
            {pendingDeletes.some((id) => (byId.get(id)?.balance ?? 0) > 0) && (
              <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
                บางรายการยังมีของคงเหลือ ถ้านำไวน์ออกไปจริงควรทำรายการเบิกแทน
              </p>
            )}
          </section>
        )}
      </Dialog>

      <ItemHistoryDialog item={historyOf} stores={stores} onClose={() => setHistoryOf(null)} />
    </div>
  )
}
