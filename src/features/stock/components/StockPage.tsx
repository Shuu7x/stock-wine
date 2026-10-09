import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Archive, ArchiveRestore, Download, GlassWater, Save, Search, Undo2 } from 'lucide-react'
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
import { drinkStatus, fmtDate, fmtInt, fmtMoney } from '@/lib/format'
import {
  stockItemsOptions,
  storesOptions,
  useArchiveStockItems,
  useUpdateStockItems,
  type StockItem,
  type StockItemPatch,
} from '../api/stock.api'
import { buildLookups, storeName, wineColumns, wineLabel } from '../columns'

export type StoreTab = 'all' | 'SW1' | 'SW2' | 'BIG'

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
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [edits, setEdits] = useState<Record<string, StockItem>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmArchive, setConfirmArchive] = useState<string[] | null>(null)

  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions(showArchived))
  const update = useUpdateStockItems()
  const archive = useArchiveStockItems()

  const stores = useMemo(() => storesQ.data ?? [], [storesQ.data])
  const all = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const live = useMemo(() => all.filter((i) => !i.deleted_at), [all])
  const lookups = useMemo(() => buildLookups(live), [live])
  const currentStore = stores.find((s) => s.code === tab)

  const serverRows = useMemo(
    () => (currentStore ? all.filter((i) => i.store_id === currentStore.id) : all),
    [all, currentStore],
  )
  const rows = useMemo(() => serverRows.map((r) => edits[r.id] ?? r), [serverRows, edits])
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all])
  const dirtyCount = Object.keys(edits).length

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
    const ro = (r: StockItem) => !!r.deleted_at
    const balance: GridColumn<StockItem> = {
      key: 'balance',
      title: 'Balance',
      subtitle: 'คงเหลือ (ขวด)',
      width: 96,
      type: 'number',
      align: 'right',
      readOnly: true,
      render: (r) => (
        <span className={r.balance === 0 ? 'text-muted' : 'font-semibold text-brand-800'}>{fmtInt(r.balance)}</span>
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
    const status: GridColumn<StockItem> = {
      key: 'status',
      title: 'สถานะ',
      width: 92,
      readOnly: true,
      get: (r) => (r.deleted_at ? 'ลบแล้ว' : r.balance === 0 ? 'หมด' : 'มีของ'),
      render: (r) =>
        r.deleted_at ? (
          <Badge tone="danger">ลบแล้ว</Badge>
        ) : r.balance === 0 ? (
          <Badge>หมด</Badge>
        ) : (
          <Badge tone="success">มีของ</Badge>
        ),
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
      ...(showArchived ? [status] : []),
    ]
    return list.map((col) => ({
      ...col,
      readOnly: col.readOnly === true ? true : ro,
    }))
  }, [stores, lookups, tab, showArchived])

  const stats = useMemo(() => {
    const src = (currentStore ? live.filter((i) => i.store_id === currentStore.id) : live).filter((i) => i.balance > 0)
    const year = new Date().getFullYear()
    return {
      items: src.length,
      bottles: src.reduce((s, i) => s + i.balance, 0),
      value: src.reduce((s, i) => s + i.balance * (i.price_per_bottle ?? 0), 0),
      ready: src.filter((i) => drinkStatus(i.maturity_from, i.maturity_to, year) === 'ready').length,
    }
  }, [live, currentStore])

  const tabCount = (id?: number) => fmtInt(live.filter((i) => (id ? i.store_id === id : true) && i.balance > 0).length)

  async function saveEdits() {
    const changes = Object.values(edits)
      .map((row) => {
        const orig = byId.get(row.id)
        const patch = orig && diff(orig, row)
        return patch ? { id: row.id, patch } : null
      })
      .filter((x) => x !== null)
    const bad = changes.find((c) => c.patch.wine_name !== undefined && !c.patch.wine_name?.trim())
    if (bad) return toast.error('ชื่อไวน์ห้ามว่าง')
    await update.mutateAsync(changes)
    setEdits({})
    toast.success(`บันทึกการแก้ไข ${changes.length} รายการแล้ว`)
  }

  const selectedLive = selectedIds.filter((id) => {
    const r = byId.get(id)
    return r && !r.deleted_at
  })
  const selectedArchived = selectedIds.filter((id) => byId.get(id)?.deleted_at)
  const selectedWithStock = selectedLive.filter((id) => (byId.get(id)?.balance ?? 0) > 0)

  function exportCsv() {
    const cols = columns.filter((c) => c.key !== 'status')
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lines = [
      cols.map((c) => esc(c.title)).join(','),
      ...rows.map((r) =>
        cols
          .map((c) => {
            if (c.key === 'store_id') return esc(storeName(stores, r.store_id))
            if (c.key === 'purchase_date') return esc(fmtDate(r.purchase_date))
            const v = c.get ? c.get(r) : (r as Record<string, unknown>)[c.key]
            return esc(v == null ? '' : String(v))
          })
          .join(','),
      ),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `stock-${tab}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title={currentStore?.name ?? 'All Stock Wines'}
        description="ดูและแก้ข้อมูลไวน์ได้ในตาราง · ยอดคงเหลือเปลี่ยนได้ผ่านการรับเข้าและเบิกเท่านั้น"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={exportCsv}>
              <Download className="size-4" /> ส่งออก CSV
            </Button>
          </>
        }
      />

      <Segmented
        value={tab}
        onChange={onTabChange}
        items={[
          { value: 'all', label: 'All Stock Wines', count: tabCount() },
          ...stores.map((s) => ({ value: s.code as StoreTab, label: s.name, count: tabCount(s.id) })),
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="รายการที่มีของ" value={fmtInt(stats.items)} />
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
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-ink-2 hover:bg-surface-3">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          แสดงรายการที่ลบแล้ว
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
          {selectedLive.length > 0 && (
            <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setConfirmArchive(selectedLive)}>
              <Archive className="size-4" /> ลบ {selectedLive.length} รายการ
            </Button>
          )}
          {selectedArchived.length > 0 && (
            <Button
              size="sm"
              loading={archive.isPending}
              onClick={() =>
                archive
                  .mutateAsync({ ids: selectedArchived, restore: true })
                  .then(() => toast.success(`กู้คืน ${selectedArchived.length} รายการแล้ว`))
              }
            >
              <ArchiveRestore className="size-4" /> กู้คืน {selectedArchived.length} รายการ
            </Button>
          )}
        </div>
      </div>

      {dirtyCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-600/30 bg-warning-50 px-4 py-2 text-sm">
          <span className="flex-1 text-warning-700">
            แก้ไขแล้ว <b>{dirtyCount}</b> รายการ ยังไม่ได้บันทึก
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEdits({})}>
            <Undo2 className="size-4" /> ยกเลิก
          </Button>
          <Button size="sm" variant="primary" loading={update.isPending} onClick={saveEdits}>
            <Save className="size-4" /> บันทึกการแก้ไข
          </Button>
        </div>
      )}

      <DataGrid
        className="min-h-[420px] flex-1"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowsChange={onRowsChange}
        onDeleteRows={(ids) => {
          const liveIds = ids.filter((id) => !byId.get(id)?.deleted_at)
          if (liveIds.length) setConfirmArchive(liveIds)
        }}
        onSelectionChange={setSelectedIds}
        rowClassName={(r) =>
          r.deleted_at ? 'opacity-55 line-through' : edits[r.id] ? '[&>div:not(:first-child)]:bg-warning-50/60' : undefined
        }
        search={search}
        emptyState={itemsQ.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีไวน์ในคลังนี้ — เริ่มจากหน้ารับเข้า'}
      />

      <Dialog
        open={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        title={`ลบ ${confirmArchive?.length ?? 0} รายการออกจากสต็อก?`}
        description="รายการจะถูกซ่อนจากสต็อก แต่ยังเก็บไว้ในฐานข้อมูลพร้อมประวัติรับเข้า/เบิก กู้คืนได้ภายหลัง"
        footer={
          <>
            <Button onClick={() => setConfirmArchive(null)}>ยกเลิก</Button>
            <Button
              variant="danger"
              loading={archive.isPending}
              onClick={async () => {
                const ids = confirmArchive ?? []
                await archive.mutateAsync({ ids })
                setEdits((e) => {
                  const out = { ...e }
                  for (const id of ids) delete out[id]
                  return out
                })
                setConfirmArchive(null)
                toast.success(`ลบ ${ids.length} รายการแล้ว (เก็บประวัติไว้)`)
              }}
            >
              ลบ
            </Button>
          </>
        }
      >
        <ul className="space-y-1 text-sm">
          {(confirmArchive ?? []).slice(0, 8).map((id) => {
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
          {(confirmArchive?.length ?? 0) > 8 && <li className="text-muted">และอีก {confirmArchive!.length - 8} รายการ</li>}
        </ul>
        {(confirmArchive ?? []).some((id) => (byId.get(id)?.balance ?? 0) > 0) && (
          <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
            บางรายการยังมีของคงเหลือ ถ้านำไวน์ออกไปจริงควรทำรายการเบิกแทน
          </p>
        )}
      </Dialog>
    </div>
  )
}
