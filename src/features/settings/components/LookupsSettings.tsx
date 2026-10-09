import { useQuery } from '@tanstack/react-query'
import { DatabaseZap, Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { AddRows } from '@/components/ui/add-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { stockItemsOptions, storesOptions, type StockItem } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { fmtInt } from '@/lib/format'
import {
  lookupValuesOptions,
  useSaveLookupValues,
  type LookupCategory,
  type LookupValue,
  type LookupWrite,
} from '../api/settings.api'

type Row = {
  _id: string
  /** แถวที่ยังไม่ได้บันทึกไม่มี id */
  id: string | null
  category: LookupCategory
  store_id: number | null
  value: string | null
  sort_order: number | null
  is_active: boolean
}

const CATEGORIES: Array<{ value: LookupCategory; label: string; valueTitle: string; field: keyof StockItem }> = [
  { value: 'country', label: 'ประเทศ', valueTitle: 'ประเทศ', field: 'country' },
  { value: 'supplier', label: 'ผู้ขาย (ซื้อจากใคร)', valueTitle: 'ชื่อผู้ขาย', field: 'supplier' },
  { value: 'rack', label: 'ชั้นวาง (Wine racks)', valueTitle: 'ชั้นวาง', field: 'rack' },
]

const ACTIVE = 'ใช้งาน'
const INACTIVE = 'ปิดใช้งาน'
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
const keyOf = (r: { category: string; store_id: number | null; value: string | null }) =>
  `${r.category}|${r.store_id ?? 0}|${norm(r.value)}`

const toRow = (l: LookupValue): Row => ({
  _id: l.id,
  id: l.id,
  category: l.category,
  store_id: l.store_id,
  value: l.value,
  sort_order: l.sort_order,
  is_active: l.is_active,
})

export function LookupsSettings() {
  const lookupsQ = useQuery(lookupValuesOptions())
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const save = useSaveLookupValues()
  const [category, setCategory] = useState<LookupCategory>('country')
  const [rows, setRows] = useState<Row[]>([])

  const stores = useMemo(() => storesQ.data ?? [], [storesQ.data])
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const original = useMemo(() => new Map((lookupsQ.data ?? []).map((l) => [l.id, l])), [lookupsQ.data])
  const cat = CATEGORIES.find((c) => c.value === category)!

  useEffect(() => {
    if (lookupsQ.data) setRows(lookupsQ.data.map(toRow))
  }, [lookupsQ.data])

  const changedFields = useCallback(
    (r: Row): Array<keyof Row> => {
      if (!r.id) return []
      const o = original.get(r.id)
      if (!o) return []
      return (['value', 'sort_order', 'is_active'] as const).filter((k) =>
        k === 'value' ? (r.value ?? '').trim() !== o.value : r[k] !== o[k],
      )
    },
    [original],
  )

  const inserts = rows.filter((r) => !r.id && r.value?.trim())
  const updates = rows.filter((r) => changedFields(r).length > 0)
  const dirty = inserts.length + updates.length > 0

  // ซ้ำในรายการเดียวกัน (ประเภท + คลัง)
  const errors = useMemo(() => {
    const count = new Map<string, number>()
    for (const r of rows) if (r.value?.trim()) count.set(keyOf(r), (count.get(keyOf(r)) ?? 0) + 1)
    const out = new Map<string, Record<string, string>>()
    for (const r of rows) {
      const e: Record<string, string> = {}
      if (r.value?.trim() && (count.get(keyOf(r)) ?? 0) > 1) e.value = 'ค่านี้ซ้ำในรายการ'
      if (r.category === 'rack' && r.value?.trim() && r.store_id == null) e.store_id = 'เลือกคลัง'
      if (r.id && !r.value?.trim()) e.value = 'ค่าห้ามว่าง (ถ้าไม่ใช้แล้วให้ปิดใช้งาน)'
      if (Object.keys(e).length) out.set(r._id, e)
    }
    return out
  }, [rows])

  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      for (const c of CATEGORIES) {
        const v = it[c.field] as string | null
        if (!v?.trim()) continue
        const k = keyOf({ category: c.value, store_id: c.value === 'rack' ? it.store_id : null, value: v })
        m.set(k, (m.get(k) ?? 0) + 1)
      }
    }
    return m
  }, [items])

  // ค่าที่มีในสต็อกแต่ยังไม่อยู่ในรายการ
  const missing = useMemo(() => {
    const have = new Set(rows.filter((r) => r.category === category).map(keyOf))
    const out = new Map<string, { value: string; store_id: number | null }>()
    for (const it of items) {
      const v = (it[cat.field] as string | null)?.trim()
      if (!v) continue
      const entry = { category, store_id: category === 'rack' ? it.store_id : null, value: v }
      const k = keyOf(entry)
      if (!have.has(k) && !out.has(k)) out.set(k, entry)
    }
    return [...out.values()].sort((a, b) => a.value.localeCompare(b.value, 'th', { numeric: true }))
  }, [rows, items, category, cat.field])

  const shown = useMemo(() => rows.filter((r) => r.category === category), [rows, category])

  const newRow = useCallback(
    (value: string | null = null, store_id: number | null = null): Row => {
      const inCat = rows.filter((r) => r.category === category)
      return {
        _id: crypto.randomUUID(),
        id: null,
        category,
        store_id: category === 'rack' ? (store_id ?? stores.find((s) => s.is_active)?.id ?? null) : null,
        value,
        sort_order: Math.max(0, ...inCat.map((r) => r.sort_order ?? 0)) + 1,
        is_active: true,
      }
    },
    [rows, category, stores],
  )

  const columns = useMemo(() => {
    const list: GridColumn<Row>[] = [
      { key: 'value', title: cat.valueTitle, width: 280 },
      {
        key: 'sort_order',
        title: 'ลำดับ',
        subtitle: 'น้อยขึ้นก่อน',
        width: 96,
        type: 'number',
        align: 'center',
        parse: (t) => {
          const s = t.trim()
          if (!s) return null
          const n = Number(s)
          return Number.isInteger(n) && n >= 0 ? n : undefined
        },
      },
      {
        key: 'is_active',
        title: 'สถานะ',
        width: 130,
        type: 'select',
        options: [ACTIVE, INACTIVE],
        get: (r) => (r.is_active ? ACTIVE : INACTIVE),
        set: (r, v) => ({ ...r, is_active: v !== INACTIVE }),
        render: (r) => (r.is_active ? <Badge tone="success">{ACTIVE}</Badge> : <Badge>{INACTIVE}</Badge>),
      },
      {
        key: 'usage',
        title: 'ใช้ในสต็อก',
        subtitle: 'จำนวนรายการ',
        width: 110,
        type: 'number',
        align: 'right',
        readOnly: true,
        get: (r) => (r.value?.trim() ? (usage.get(keyOf(r)) ?? 0) : null),
        format: (v) => (v == null ? '' : fmtInt(v as number)),
      },
    ]
    if (category === 'rack') {
      list.splice(0, 0, {
        key: 'store_id',
        title: 'คลัง',
        width: 170,
        type: 'select',
        // ย้ายชั้นวางข้ามคลังไม่ได้ (แถวเดิม) — สร้างใหม่ในคลังปลายทางแทน
        readOnly: (r) => !!r.id,
        options: stores.filter((s) => s.is_active).map((s) => s.name),
        format: (v) => storeName(stores, v as number | null),
        parse: (t) => {
          const s = t.trim().toLowerCase()
          if (!s) return null
          const hit = stores.find((x) => x.is_active && (x.name.toLowerCase() === s || x.code.toLowerCase() === s))
          return hit ? hit.id : undefined
        },
      })
    }
    return list
  }, [cat.valueTitle, category, stores, usage])

  function onRowsChange(next: Row[]) {
    setRows((all) => [...all.filter((r) => r.category !== category), ...next])
  }

  function onDeleteRows(ids: string[]) {
    const drop = new Set(ids)
    const deactivated = rows.some((r) => drop.has(r._id) && r.id && r.is_active)
    setRows((all) =>
      all
        .filter((r) => !(drop.has(r._id) && !r.id))
        .map((r) => (drop.has(r._id) && r.id ? { ...r, is_active: false } : r)),
    )
    if (deactivated) toast.info('รายการที่บันทึกแล้วลบไม่ได้ จึงเปลี่ยนเป็น “ปิดใช้งาน” แทน')
  }

  async function submit() {
    if (errors.size) return toast.error('มีข้อมูลซ้ำหรือไม่ครบ ดูช่องที่มีมุมสีแดง')
    const payload: LookupWrite[] = [
      ...updates.map((r) => ({
        id: r.id!,
        category: r.category,
        store_id: r.store_id,
        value: r.value!.trim(),
        sort_order: r.sort_order ?? 0,
        is_active: r.is_active,
      })),
      ...inserts.map((r) => ({
        category: r.category,
        store_id: r.store_id,
        value: r.value!.trim(),
        sort_order: r.sort_order ?? 0,
        is_active: r.is_active,
      })),
    ]
    await save.mutateAsync(payload)
    toast.success(`บันทึกแล้ว (เพิ่ม ${inserts.length} · แก้ไข ${updates.length})`)
  }

  const countOf = (c: LookupCategory) => fmtInt(rows.filter((r) => r.category === c && r.id && r.is_active).length)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface px-5 py-4">
        <h2 className="text-base font-semibold">ตัวเลือกที่ใช้บ่อย</h2>
        <p className="mt-0.5 text-sm text-muted">
          รายการที่ขึ้นให้เลือกในตารางรับเข้า/สต็อก (ปุ่ม ▾) เรียงตาม “ลำดับ” ก่อน ตามด้วยค่าอื่นที่มีอยู่ในสต็อก ·
          ค่าที่ปิดใช้งานจะไม่ขึ้นให้เลือก
        </p>
      </div>

      <Segmented
        value={category}
        onChange={setCategory}
        items={CATEGORIES.map((c) => ({ value: c.value, label: c.label, count: countOf(c.value) }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <AddRows onAdd={(n) => setRows((all) => [...all, ...Array.from({ length: n }, () => newRow())])} defaultCount={3} />
        {missing.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRows((all) => {
                let order = Math.max(0, ...all.filter((r) => r.category === category).map((r) => r.sort_order ?? 0))
                return [...all, ...missing.map((m) => ({ ...newRow(m.value, m.store_id), sort_order: ++order }))]
              })
              toast.success(`เพิ่ม ${missing.length} ค่าจากข้อมูลสต็อก — ตรวจแล้วกดบันทึก`)
            }}
          >
            <DatabaseZap className="size-4" /> นำเข้าจากสต็อก ({missing.length})
          </Button>
        )}
        {dirty && (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRows((lookupsQ.data ?? []).map(toRow))}>
              <Undo2 className="size-4" /> ยกเลิกทั้งหมด
            </Button>
            <Button size="sm" variant="primary" loading={save.isPending} onClick={submit}>
              <Save className="size-4" /> บันทึก
            </Button>
          </div>
        )}
      </div>

      <DataGrid
        key={category}
        className="h-[min(560px,70dvh)]"
        rows={shown}
        columns={columns}
        getRowId={(r) => r._id}
        onRowsChange={onRowsChange}
        createRow={() => newRow()}
        onDeleteRows={onDeleteRows}
        rowStatus={(r) => (!r.id && r.value?.trim() ? 'added' : null)}
        cellChanged={(r, key) => changedFields(r).includes(key === 'is_active' ? 'is_active' : (key as keyof Row))}
        cellError={(r, key) => errors.get(r._id)?.[key] ?? null}
        rowClassName={(r) => (r.is_active ? undefined : 'text-muted')}
        pageSizeKey={`lookups-${category}`}
        emptyState={lookupsQ.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีรายการ — กดเพิ่มแถว หรือนำเข้าจากสต็อก'}
      />
    </div>
  )
}
