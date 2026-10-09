import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { DocToolbar } from '@/components/ui/doc-toolbar'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { identityKey, storeName, wineLabel } from '@/features/stock/columns'
import { makePicker, useStockData, wineError, type PickerRow } from '@/features/stock/item-picker'
import { usePrefillRows } from '@/features/stock/use-prefill'
import { fmtInt, todayIso } from '@/lib/format'
import { useInitialDraft, usePersistDraft } from '@/lib/use-local-draft'
import { usePostTransfer } from '../api/operations.api'

type TfRow = PickerRow & { qty: number | null; to_store_id: number | null; to_rack: string | null; remark: string | null }
type Draft = { rows: TfRow[]; transferredAt: string; note: string; defaultTo: number | null }

const DRAFT_KEY = 'stock-wine:transfer-draft:v1'
const isBlank = (r: TfRow) => !r.stock_item_id && !r.wine_text?.trim() && r.qty == null && !r.to_rack && !r.remark

export function TransferPage({ prefillIds }: { prefillIds: string[] }) {
  const { stores, items, byId, lookups } = useStockData()
  const post = usePostTransfer()
  const activeStores = useMemo(() => stores.filter((s) => s.is_active), [stores])

  const draft = useInitialDraft<Draft>(DRAFT_KEY)
  const [defaultTo, setDefaultTo] = useState<number | null>(draft?.defaultTo ?? null)
  const newRow = (stockItemId: string | null = null): TfRow => ({
    _id: crypto.randomUUID(),
    stock_item_id: stockItemId,
    wine_text: null,
    qty: stockItemId ? (byId.get(stockItemId)?.balance ?? 1) : null,
    to_store_id: defaultTo,
    to_rack: null,
    remark: null,
  })
  const [rows, setRows] = useState<TfRow[]>(() => draft?.rows ?? Array.from({ length: 6 }, () => newRow()))
  const [transferredAt, setTransferredAt] = useState(draft?.transferredAt ?? todayIso())
  const [note, setNote] = useState(draft?.note ?? '')
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  usePrefillRows({ ids: prefillIds, to: '/transfer', setRows, makeRow: newRow, isBlank })

  const filled = useMemo(() => rows.filter((r) => !isBlank(r)), [rows])
  const draftValue = useMemo(() => ({ rows, transferredAt, note, defaultTo }), [rows, transferredAt, note, defaultTo])
  usePersistDraft(DRAFT_KEY, draftValue, !filled.length && !note)

  const byIdentity = useMemo(() => new Map(items.map((i) => [identityKey(i), i])), [items])
  /** ไวน์เดียวกันที่ปลายทาง (ถ้ามี) — ไม่มี = จะสร้างรายการใหม่ */
  const destOf = (r: TfRow) => {
    const src = r.stock_item_id ? byId.get(r.stock_item_id) : undefined
    if (!src || r.to_store_id == null) return undefined
    return byIdentity.get(identityKey({ store_id: r.to_store_id, wine_name: src.wine_name, vintage: src.vintage, rack: r.to_rack }))
  }
  const sameAsSource = (r: TfRow) => {
    const src = r.stock_item_id ? byId.get(r.stock_item_id) : undefined
    return !!src && r.to_store_id === src.store_id && (r.to_rack ?? '').trim().toLowerCase() === (src.rack ?? '').trim().toLowerCase()
  }

  const errors = useMemo(() => {
    const used = new Map<string, number>()
    for (const r of filled) if (r.stock_item_id) used.set(r.stock_item_id, (used.get(r.stock_item_id) ?? 0) + (r.qty ?? 0))
    const out = new Map<string, Record<string, string>>()
    for (const r of filled) {
      const e: Record<string, string> = {}
      const it = r.stock_item_id ? byId.get(r.stock_item_id) : undefined
      const we = wineError(r, it)
      if (we) e.wine = we
      if (r.qty == null) e.qty = 'ระบุจำนวน'
      else if (!Number.isInteger(r.qty) || r.qty <= 0) e.qty = 'จำนวนเต็มมากกว่า 0'
      else if (it && (used.get(it.id) ?? 0) > it.balance) e.qty = `เกินยอดคงเหลือ (เหลือ ${it.balance} ขวด)`
      if (r.to_store_id == null) e.to_store_id = 'เลือกคลังปลายทาง'
      else if (sameAsSource(r)) e.to_rack = 'ปลายทางต้องต่างจากต้นทาง (คลังหรือ rack)'
      if (Object.keys(e).length) out.set(r._id, e)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled, byId])

  const columns = useMemo(() => {
    const p = makePicker<TfRow>({
      stores,
      lookups,
      byId,
      pool: () => items.filter((i) => i.balance > 0),
      onPick: (r, it) => ({ ...r, qty: r.qty ?? it.balance, to_store_id: r.to_store_id ?? defaultTo }),
    })
    const list: GridColumn<TfRow>[] = [
      p.lift(p.c.store, { title: 'จากคลัง', subtitle: 'ต้นทาง' }),
      p.lift(p.c.rack, { title: 'จาก Rack' }),
      p.wine,
      p.lift(p.c.vintage),
      p.balance('ต้นทาง → หลังโอน', (r, it) => it.balance - (r.qty ?? 0)),
      {
        key: 'qty',
        title: 'จำนวนโอน',
        subtitle: 'ขวด',
        width: 92,
        type: 'number',
        align: 'right',
        parse: (t) => {
          const s = t.trim()
          if (!s) return null
          const n = Number(s)
          return Number.isInteger(n) && n >= 0 ? n : undefined
        },
      },
      {
        key: 'to_store_id',
        title: 'ไปคลัง',
        subtitle: 'ปลายทาง',
        width: 200,
        type: 'select',
        options: activeStores.map((s) => s.name),
        format: (v) => storeName(stores, v as number | null),
        parse: (t) => {
          const s = t.trim().toLowerCase()
          if (!s) return null
          const hit = activeStores.find((x) => x.name.toLowerCase() === s || x.code.toLowerCase() === s)
          return hit ? hit.id : undefined
        },
      },
      {
        key: 'to_rack',
        title: 'ไป Rack',
        width: 100,
        options: (r) => (r.to_store_id ? (lookups.racksByStore.get(r.to_store_id) ?? []) : lookups.allRacks),
      },
      {
        key: 'dest',
        title: 'ปลายทาง',
        width: 130,
        readOnly: true,
        filterable: false,
        get: (r) => {
          if (!r.stock_item_id || r.to_store_id == null || sameAsSource(r)) return null
          const d = destOf(r)
          return d ? 'เพิ่มยอด' : 'ใหม่'
        },
        render: (r) => {
          if (!r.stock_item_id || r.to_store_id == null || sameAsSource(r)) return null
          const d = destOf(r)
          return d ? (
            <span className="flex items-center gap-1.5">
              <Badge tone="info">เพิ่มยอด</Badge>
              <span className="text-xs text-muted tabular-nums">
                {d.balance} → {d.balance + (r.qty ?? 0)}
              </span>
            </span>
          ) : (
            <Badge tone="gold">สร้างใหม่</Badge>
          )
        },
      },
      { key: 'remark', title: 'Remark', subtitle: 'หมายเหตุ', width: 200 },
    ]
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, activeStores, lookups, byId, items, byIdentity, defaultTo])

  const totalQty = filled.reduce((s, r) => s + (r.qty ?? 0), 0)

  function reset() {
    setRows(Array.from({ length: 6 }, () => newRow()))
    setNote('')
    setShowErrors(false)
  }

  function trySave() {
    if (!filled.length) return toast.info('ยังไม่มีรายการโอนย้าย')
    if (errors.size) {
      setShowErrors(true)
      return toast.error(`มี ${errors.size} แถวที่ยังไม่ถูกต้อง ดูช่องที่มีมุมสีแดง`)
    }
    setConfirm(true)
  }

  async function submit() {
    const doc = await post.mutateAsync({
      transferredAt,
      note,
      lines: filled.map((r) => ({
        stock_item_id: r.stock_item_id!,
        qty: r.qty!,
        to_store_id: r.to_store_id!,
        to_rack: r.to_rack,
        remark: r.remark,
      })),
    })
    setConfirm(false)
    reset()
    toast.success(`บันทึกโอนย้าย ${doc.doc_no} แล้ว`, { description: `${filled.length} รายการ · ${fmtInt(totalQty)} ขวด` })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="โอนย้ายไวน์"
        description={
          <>
            ย้ายไวน์ข้ามคลังหรือเปลี่ยน rack ยอดต้นทางลด ปลายทางเพิ่มในใบเดียว ·{' '}
            <Link to="/history" search={{ tab: 'transfers' }} className="text-brand-700 underline">
              ดูประวัติการโอนย้าย
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[160px_240px_1fr]">
        <Field label="วันที่โอนย้าย">
          <DateInput value={transferredAt} max={todayIso()} onChange={setTransferredAt} />
        </Field>
        <Field label="คลังปลายทางตั้งต้น">
          <Combobox
            value={defaultTo ?? 0}
            placeholder="เลือกคลังปลายทาง"
            options={[{ value: 0, label: 'ไม่กำหนด' }, ...activeStores.map((s) => ({ value: s.id, label: s.name, hint: s.code }))]}
            onChange={(v) => {
              const id = v || null
              setDefaultTo(id)
              // แถวที่ยังไม่ได้เลือกปลายทาง ใช้ค่านี้ไปด้วย
              setRows((rs) => rs.map((r) => (r.to_store_id == null ? { ...r, to_store_id: id } : r)))
            }}
          />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น จัดโชว์ใหม่ / ย้ายเข้าห้องเย็น" />
        </Field>
      </div>

      <DocToolbar
        onAddRows={(n) => setRows((rs) => [...rs, ...Array.from({ length: n }, () => newRow())])}
        selectedCount={rows.length > 1 ? selectedIds.length : 0}
        onDeleteSelected={() => {
          const drop = new Set(selectedIds)
          setRows((rs) => {
            const left = rs.filter((r) => !drop.has(r._id))
            return left.length ? left : [newRow()]
          })
        }}
        onClear={reset}
        canClear={filled.length > 0 || !!note}
        summary={
          <>
            <b className="tabular-nums">{filled.length}</b> รายการ · <b className="tabular-nums">{fmtInt(totalQty)}</b> ขวด
          </>
        }
        saveLabel="บันทึกโอนย้าย"
        onSave={trySave}
        saveDisabled={!filled.length}
      />

      <DataGrid
        className="min-h-[380px] flex-1"
        rows={rows}
        columns={columns}
        getRowId={(r) => r._id}
        onRowsChange={setRows}
        createRow={() => newRow()}
        onSelectionChange={setSelectedIds}
        pageSizeKey="transfer"
        cellError={(r, key) => (showErrors && !isBlank(r) ? (errors.get(r._id)?.[key] ?? null) : null)}
      />

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ยืนยันบันทึกโอนย้าย"
        description={note || undefined}
        size="lg"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={post.isPending} onClick={submit}>
              ยืนยันโอนย้าย
            </Button>
          </>
        }
      >
      {/* สร้างเนื้อหาเฉพาะตอนเปิด: แถวที่ยังกรอกไม่ครบจะไม่ทำให้หน้าพัง */}
      {confirm && (
        <>
        <ul className="divide-y divide-line text-sm">
          {filled.map((r) => {
            const it = byId.get(r.stock_item_id!)!
            const d = destOf(r)
            return (
              <li key={r._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 font-medium">{wineLabel(it)}</span>
                <span className="flex items-center gap-1.5 text-ink-2">
                  {storeName(stores, it.store_id)} · {it.rack ?? '-'}
                  <ArrowRight className="size-3.5 text-muted" />
                  {storeName(stores, r.to_store_id)} · {r.to_rack ?? '-'}
                </span>
                <b className="tabular-nums">{r.qty} ขวด</b>
                {d ? <Badge tone="info">เพิ่มยอด</Badge> : <Badge tone="gold">สร้างใหม่</Badge>}
              </li>
            )
          })}
        </ul>
        </>
      )}
      </Dialog>
    </div>
  )
}
