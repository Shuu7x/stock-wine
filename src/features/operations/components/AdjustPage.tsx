import { Link } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
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
import { storeName, wineLabel } from '@/features/stock/columns'
import { makePicker, useStockData, wineError, type PickerRow } from '@/features/stock/item-picker'
import { usePrefillRows } from '@/features/stock/use-prefill'
import { fmtInt, todayIso } from '@/lib/format'
import { useInitialDraft, usePersistDraft } from '@/lib/use-local-draft'
import { usePostAdjustment } from '../api/operations.api'

type AdjRow = PickerRow & { counted: number | null; reason: string | null; remark: string | null }
type Draft = { rows: AdjRow[]; adjustedAt: string; note: string }

const DRAFT_KEY = 'stock-wine:adjust-draft:v1'
/** สาเหตุที่ใช้บ่อย (พิมพ์สาเหตุอื่นเองได้) */
export const ADJUST_REASONS = ['นับสต็อก', 'ขวดแตก / ชำรุด', 'สูญหาย', 'พบเพิ่ม', 'บันทึกผิดพลาด', 'ใช้ชิม / ตัวอย่าง']

const newRow = (stockItemId: string | null = null, reason: string | null = null): AdjRow => ({
  _id: crypto.randomUUID(),
  stock_item_id: stockItemId,
  wine_text: null,
  counted: null,
  reason,
  remark: null,
})
const isBlank = (r: AdjRow) => !r.stock_item_id && !r.wine_text?.trim() && r.counted == null && !r.remark

export function AdjustPage({ prefillIds }: { prefillIds: string[] }) {
  const { stores, items, byId, lookups } = useStockData()
  const post = usePostAdjustment()
  const activeStores = useMemo(() => stores.filter((s) => s.is_active), [stores])

  const draft = useInitialDraft<Draft>(DRAFT_KEY)
  const [rows, setRows] = useState<AdjRow[]>(() => draft?.rows ?? Array.from({ length: 6 }, () => newRow()))
  const [adjustedAt, setAdjustedAt] = useState(draft?.adjustedAt ?? todayIso())
  const [note, setNote] = useState(draft?.note ?? '')
  const [countStore, setCountStore] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  usePrefillRows({ ids: prefillIds, to: '/adjust', setRows, makeRow: (id) => newRow(id ?? null), isBlank })

  const filled = useMemo(() => rows.filter((r) => !isBlank(r)), [rows])
  const draftValue = useMemo(() => ({ rows, adjustedAt, note }), [rows, adjustedAt, note])
  usePersistDraft(DRAFT_KEY, draftValue, !filled.length && !note)

  const diffOf = (r: AdjRow) => {
    const it = r.stock_item_id ? byId.get(r.stock_item_id) : undefined
    return it && r.counted != null ? r.counted - it.balance : null
  }
  /** แถวที่ต้องปรับจริง (นับแล้วและยอดไม่ตรง) */
  const changed = filled.filter((r) => (diffOf(r) ?? 0) !== 0)

  const errors = useMemo(() => {
    const out = new Map<string, Record<string, string>>()
    const seen = new Set<string>()
    for (const r of filled) {
      const e: Record<string, string> = {}
      const it = r.stock_item_id ? byId.get(r.stock_item_id) : undefined
      const we = wineError(r, it)
      if (we) e.wine = we
      if (it && seen.has(it.id)) e.wine = 'ไวน์นี้อยู่ในใบนี้แล้ว'
      if (it) seen.add(it.id)
      if (r.counted != null && (!Number.isInteger(r.counted) || r.counted < 0)) e.counted = 'จำนวนเต็ม 0 ขึ้นไป'
      if (it && r.counted != null && r.counted !== it.balance && !r.reason?.trim()) e.reason = 'ระบุสาเหตุ'
      if (Object.keys(e).length) out.set(r._id, e)
    }
    return out
  }, [filled, byId])

  const columns = useMemo(() => {
    const p = makePicker<AdjRow>({ stores, lookups, byId, pool: () => items })
    const list: GridColumn<AdjRow>[] = [
      p.lift(p.c.store),
      p.lift(p.c.rack),
      p.wine,
      p.lift(p.c.vintage),
      {
        key: 'system',
        title: 'ในระบบ',
        subtitle: 'คงเหลือ (ขวด)',
        width: 92,
        type: 'number',
        align: 'right',
        readOnly: true,
        get: (r) => p.item(r)?.balance ?? null,
      },
      {
        key: 'counted',
        title: 'นับได้จริง',
        subtitle: 'ขวด',
        width: 100,
        type: 'number',
        align: 'right',
        placeholder: 'จำนวนที่นับได้',
        parse: (t) => {
          const s = t.trim()
          if (!s) return null
          const n = Number(s)
          return Number.isInteger(n) && n >= 0 ? n : undefined
        },
      },
      {
        key: 'diff',
        title: 'ผลต่าง',
        subtitle: '+ เพิ่ม / − ลด',
        width: 100,
        type: 'number',
        align: 'right',
        readOnly: true,
        get: (r) => diffOf(r),
        filterValue: (r) => {
          const d = diffOf(r)
          return d == null ? 'ยังไม่นับ' : d === 0 ? 'ตรง' : d > 0 ? 'เพิ่ม' : 'ลด'
        },
        render: (r) => {
          const d = diffOf(r)
          if (d == null) return null
          if (d === 0) return <Badge tone="success">ตรง</Badge>
          return <b className={d > 0 ? 'text-info-600' : 'text-danger-700'}>{d > 0 ? `+${d}` : d}</b>
        },
      },
      { key: 'reason', title: 'สาเหตุ', width: 170, options: ADJUST_REASONS },
      { key: 'remark', title: 'Remark', subtitle: 'หมายเหตุ', width: 200 },
    ]
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, lookups, byId, items])

  /** นับสต็อกทั้งคลัง: ดึงทุกรายการของคลังมาใส่ (ช่อง "นับได้จริง" ว่างไว้ให้กรอก) */
  function loadStore() {
    if (!countStore) return toast.info('เลือกคลังที่จะนับก่อน')
    const have = new Set(rows.map((r) => r.stock_item_id))
    const add = items
      .filter((i) => i.store_id === countStore && !have.has(i.id))
      .sort((a, b) => (a.rack ?? '').localeCompare(b.rack ?? '', 'th', { numeric: true }) || a.wine_name.localeCompare(b.wine_name))
      .map((i) => newRow(i.id, 'นับสต็อก'))
    if (!add.length) return toast.info('ทุกรายการของคลังนี้อยู่ในตารางแล้ว')
    setRows((rs) => [...rs.filter((r) => !isBlank(r)), ...add])
    toast.success(`เพิ่ม ${add.length} รายการจาก ${storeName(stores, countStore)} — กรอกช่อง “นับได้จริง”`)
  }

  function reset() {
    setRows(Array.from({ length: 6 }, () => newRow()))
    setNote('')
    setShowErrors(false)
  }

  function trySave() {
    if (errors.size) {
      setShowErrors(true)
      return toast.error(`มี ${errors.size} แถวที่ยังไม่ถูกต้อง ดูช่องที่มีมุมสีแดง`)
    }
    if (!changed.length) return toast.info('ยังไม่มีรายการที่ยอดไม่ตรง (กรอก “นับได้จริง” ก่อน)')
    setConfirm(true)
  }

  async function submit() {
    const doc = await post.mutateAsync({
      adjustedAt,
      note,
      lines: changed.map((r) => ({ stock_item_id: r.stock_item_id!, counted: r.counted!, reason: r.reason!.trim(), remark: r.remark })),
    })
    setConfirm(false)
    reset()
    toast.success(`บันทึกปรับยอด ${doc.doc_no} แล้ว`, { description: `${changed.length} รายการ` })
  }

  const plus = changed.reduce((s, r) => s + Math.max(0, diffOf(r) ?? 0), 0)
  const minus = changed.reduce((s, r) => s + Math.min(0, diffOf(r) ?? 0), 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="ปรับยอดสต็อก"
        description={
          <>
            กรอกจำนวนที่นับได้จริง ระบบคำนวณผลต่างให้ · แถวที่ยอดตรงหรือยังไม่กรอกจะไม่ถูกบันทึก ·{' '}
            <Link to="/history" search={{ tab: 'adjustments' }} className="text-brand-700 underline">
              ดูประวัติการปรับยอด
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[160px_1fr_auto]">
        <Field label="วันที่ปรับยอด">
          <DateInput value={adjustedAt} max={todayIso()} onChange={setAdjustedAt} />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น นับสต็อกประจำเดือน ต.ค." />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">นับสต็อกทั้งคลัง</span>
          <div className="flex gap-2">
            <Combobox
              className="w-52"
              value={countStore}
              placeholder="เลือกคลัง"
              options={[{ value: 0, label: 'เลือกคลัง…' }, ...activeStores.map((s) => ({ value: s.id, label: s.name, hint: s.code }))]}
              onChange={setCountStore}
            />
            <Button onClick={loadStore}>
              <ClipboardList className="size-4" /> ดึงรายการ
            </Button>
          </div>
        </div>
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
          <span className="tabular-nums">
            ต้องปรับ <b>{changed.length}</b> รายการ
            {plus > 0 && <span className="ml-2 text-info-600">+{fmtInt(plus)}</span>}
            {minus < 0 && <span className="ml-2 text-danger-700">{fmtInt(minus)}</span>}
            <span className="ml-1">ขวด</span>
          </span>
        }
        saveLabel="บันทึกปรับยอด"
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
        pageSizeKey="adjust"
        cellError={(r, key) => (showErrors && !isBlank(r) ? (errors.get(r._id)?.[key] ?? null) : null)}
        statusLabels={{ changed: 'ยอดไม่ตรง' }}
        cellChanged={(r, key) => key === 'counted' && (diffOf(r) ?? 0) !== 0}
      />

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ยืนยันบันทึกปรับยอด"
        description={note || undefined}
        size="lg"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={post.isPending} onClick={submit}>
              ยืนยันปรับยอด
            </Button>
          </>
        }
      >
      {/* สร้างเนื้อหาเฉพาะตอนเปิด: แถวที่ยังกรอกไม่ครบจะไม่ทำให้หน้าพัง */}
      {confirm && (
        <>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">ไวน์</th>
              <th className="pb-2 text-right font-medium">ในระบบ</th>
              <th className="pb-2 text-right font-medium">นับได้</th>
              <th className="pb-2 text-right font-medium">ผลต่าง</th>
              <th className="hidden pb-2 pl-3 font-medium sm:table-cell">สาเหตุ</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {changed.map((r) => {
              const it = byId.get(r.stock_item_id!)!
              const d = diffOf(r)!
              return (
                <tr key={r._id} className="border-t border-line">
                  <td className="py-2 pr-2">
                    {wineLabel(it)}
                    <div className="text-xs text-muted">
                      {storeName(stores, it.store_id)} · {it.rack ?? '-'}
                    </div>
                  </td>
                  <td className="py-2 text-right">{it.balance}</td>
                  <td className="py-2 text-right">{r.counted}</td>
                  <td className={d > 0 ? 'py-2 text-right text-info-600' : 'py-2 text-right text-danger-700'}>
                    {d > 0 ? `+${d}` : d}
                  </td>
                  <td className="hidden py-2 pl-3 sm:table-cell">{r.reason}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
      )}
      </Dialog>
    </div>
  )
}
