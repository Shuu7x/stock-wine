import { useQuery } from '@tanstack/react-query'
import { Save, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { AddRows } from '@/components/ui/add-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loading } from '@/components/ui/loading'
import { stockItemsOptions, storesOptions, type Store } from '@/features/stock/api/stock.api'
import { fmtInt } from '@/lib/format'
import { useSaveStores } from '../api/settings.api'

type Row = {
  _id: string
  /** แถวที่ยังไม่ได้บันทึกไม่มี id */
  id: number | null
  name: string | null
  code: string | null
  sort_order: number | null
  is_active: boolean
}

const ACTIVE = 'ใช้งาน'
const INACTIVE = 'ปิดใช้งาน'
const FIELDS = ['name', 'code', 'sort_order', 'is_active'] as const

const toRow = (s: Store): Row => ({
  _id: String(s.id),
  id: s.id,
  name: s.name,
  code: s.code,
  sort_order: s.sort_order,
  is_active: s.is_active,
})

/** คลังสินค้าเป็นตาราง แก้ไขหลายคลังแล้วบันทึกทีเดียว (แบบเดียวกับแท็บตัวเลือกอื่น) */
export function StoresSettings() {
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const save = useSaveStores()
  const [rows, setRows] = useState<Row[]>([])

  const original = useMemo(() => new Map((storesQ.data ?? []).map((s) => [s.id, s])), [storesQ.data])
  const reset = useCallback(
    () => setRows([...(storesQ.data ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(toRow)),
    [storesQ.data],
  )
  useEffect(reset, [reset])

  const stats = useMemo(() => {
    const m = new Map<number, { items: number; bottles: number }>()
    for (const i of itemsQ.data ?? []) {
      if (i.balance <= 0) continue
      const s = m.get(i.store_id) ?? { items: 0, bottles: 0 }
      s.items++
      s.bottles += i.balance
      m.set(i.store_id, s)
    }
    return m
  }, [itemsQ.data])

  const changedFields = useCallback(
    (r: Row): Array<keyof Row> => {
      const o = r.id != null ? original.get(r.id) : undefined
      if (!o) return []
      return FIELDS.filter((k) =>
        k === 'name' ? (r.name ?? '').trim() !== o.name : k === 'code' ? (r.code ?? '').trim() !== o.code : r[k] !== o[k],
      )
    },
    [original],
  )

  const inserts = rows.filter((r) => r.id == null && (r.name?.trim() || r.code?.trim()))
  const updates = rows.filter((r) => changedFields(r).length > 0)
  const dirty = inserts.length + updates.length > 0

  const errors = useMemo(() => {
    const codes = new Map<string, number>()
    for (const r of rows) if (r.code?.trim()) codes.set(r.code.trim(), (codes.get(r.code.trim()) ?? 0) + 1)
    const out = new Map<string, Record<string, string>>()
    for (const r of rows) {
      if (r.id == null && !r.name?.trim() && !r.code?.trim()) continue
      const e: Record<string, string> = {}
      if (!r.name?.trim()) e.name = 'ระบุชื่อคลัง'
      else if (r.name.trim().length > 60) e.name = 'ยาวเกิน 60 ตัวอักษร'
      if (!r.code?.trim()) e.code = 'ระบุรหัส'
      else if (!/^[A-Z0-9_-]{1,12}$/.test(r.code.trim())) e.code = 'ใช้ A-Z 0-9 _ - ไม่เกิน 12 ตัว'
      else if ((codes.get(r.code.trim()) ?? 0) > 1) e.code = 'รหัสซ้ำกับคลังอื่น'
      if (r.id != null && !r.is_active && original.get(r.id)?.is_active && (stats.get(r.id)?.bottles ?? 0) > 0)
        e.is_active = 'คลังนี้ยังมีไวน์คงเหลือ ปิดใช้งานไม่ได้ (เบิกหรือย้ายออกให้หมดก่อน)'
      if (Object.keys(e).length) out.set(r._id, e)
    }
    return out
  }, [rows, original, stats])

  const newRow = useCallback(
    (): Row => ({
      _id: crypto.randomUUID(),
      id: null,
      name: null,
      code: null,
      sort_order: Math.max(0, ...rows.map((r) => r.sort_order ?? 0)) + 1,
      is_active: true,
    }),
    [rows],
  )

  const columns = useMemo<GridColumn<Row>[]>(
    () => [
      { key: 'name', title: 'ชื่อคลัง', width: 220, placeholder: 'เช่น Cellar Room' },
      {
        key: 'code',
        title: 'รหัส',
        subtitle: 'ใช้ใน URL · A-Z 0-9',
        width: 120,
        placeholder: 'CEL',
        parse: (t) => t.trim().toUpperCase() || null,
      },
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
        key: 'items',
        title: 'รายการที่มีของ',
        width: 120,
        type: 'number',
        align: 'right',
        readOnly: true,
        get: (r) => (r.id == null ? null : (stats.get(r.id)?.items ?? 0)),
        format: (v) => (v == null ? '' : fmtInt(v as number)),
      },
      {
        key: 'bottles',
        title: 'ขวด',
        width: 100,
        type: 'number',
        align: 'right',
        readOnly: true,
        get: (r) => (r.id == null ? null : (stats.get(r.id)?.bottles ?? 0)),
        format: (v) => (v == null ? '' : fmtInt(v as number)),
      },
    ],
    [stats],
  )

  function onDeleteRows(ids: string[]) {
    const drop = new Set(ids)
    let blocked = 0
    let deactivated = 0
    setRows((all) =>
      all
        .filter((r) => !(drop.has(r._id) && r.id == null))
        .map((r) => {
          if (!drop.has(r._id) || r.id == null || !r.is_active) return r
          if ((stats.get(r.id)?.bottles ?? 0) > 0) return blocked++, r
          return deactivated++, { ...r, is_active: false }
        }),
    )
    if (deactivated) toast.info('คลังที่บันทึกแล้วลบไม่ได้ จึงเปลี่ยนเป็น “ปิดใช้งาน” แทน')
    if (blocked) toast.error(`มี ${blocked} คลังที่ยังมีไวน์คงเหลือ ปิดใช้งานไม่ได้`)
  }

  async function submit() {
    if (errors.size) return toast.error('ข้อมูลไม่ครบหรือซ้ำ ดูช่องที่มีมุมสีแดง')
    const values = (r: Row) => ({
      name: r.name!.trim(),
      code: r.code!.trim(),
      sort_order: r.sort_order ?? 0,
      is_active: r.is_active,
    })
    await save.mutateAsync([
      ...updates.map((r) => ({ id: r.id!, values: values(r) })),
      ...inserts.map((r) => ({ values: values(r) })),
    ])
    toast.success(`บันทึกแล้ว (เพิ่ม ${inserts.length} · แก้ไข ${updates.length})`)
  }

  return (
    <>
      <p className="text-sm text-muted">
        คลังที่ปิดใช้งานจะไม่แสดงเป็นแท็บและเลือกไม่ได้ตอนทำรายการ แต่ข้อมูลเดิมยังอยู่ · ปิดคลังที่ยังมีไวน์คงเหลือไม่ได้
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <AddRows
          defaultCount={1}
          onAdd={(n) => {
            const first = newRow()
            setRows((all) => [...all, ...Array.from({ length: n }, (_, i) => ({ ...first, _id: crypto.randomUUID(), sort_order: first.sort_order! + i }))])
          }}
        />
        {dirty && (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={reset}>
              <Undo2 className="size-4" /> ยกเลิกทั้งหมด
            </Button>
            <Button size="sm" variant="primary" loading={save.isPending} onClick={submit}>
              <Save className="size-4" /> บันทึก
            </Button>
          </div>
        )}
      </div>

      <DataGrid
        className="h-[min(560px,70dvh)]"
        rows={rows}
        columns={columns}
        card={{ noun: 'คลัง', fields: ['code', 'sort_order', 'is_active', 'items', 'bottles'] }}
        getRowId={(r) => r._id}
        onRowsChange={setRows}
        createRow={newRow}
        onDeleteRows={onDeleteRows}
        rowStatus={(r) => (r.id == null && (r.name?.trim() || r.code?.trim()) ? 'added' : null)}
        cellChanged={(r, key) => changedFields(r).includes(key as keyof Row)}
        cellError={(r, key) => errors.get(r._id)?.[key] ?? null}
        rowClassName={(r) => (r.is_active ? undefined : 'text-muted')}
        pageSizeKey="lookups-stores"
        emptyState={storesQ.isLoading ? <Loading /> : 'ยังไม่มีคลัง — กดเพิ่มแถว'}
      />
    </>
  )
}
