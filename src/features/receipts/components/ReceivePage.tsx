import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eraser, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn, Suggestion } from '@/components/data-grid/types'
import { AddRows } from '@/components/ui/add-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { stockItemsOptions, storesOptions, type StockItem, type Store } from '@/features/stock/api/stock.api'
import { buildLookups, identityKey, storeName, wineColumns, wineLabel } from '@/features/stock/columns'
import { fmtInt, fmtMoney, todayIso } from '@/lib/format'
import { usePostReceipt, type ReceiptLineInput } from '../api/receipts.api'
import {
  isBlankRow,
  loadReceiveDraft,
  newReceiveRow,
  saveReceiveDraft,
  validateReceiveRow,
  type ReceiveRow,
} from '../draft'

const START_ROWS = 10

const UPDATABLE = ['country', 'rating_rp', 'rating_ws', 'price_per_bottle', 'supplier', 'purchase_date', 'remark'] as const

function wineSuggest(items: StockItem[], stores: Store[]) {
  return (q: string, row: ReceiveRow): Suggestion<ReceiveRow>[] => {
    const ql = q.toLowerCase()
    const hits = items
      .filter((i) => !ql || `${i.wine_name} ${i.vintage ?? 'nv'} ${i.country ?? ''}`.toLowerCase().includes(ql))
      .sort(
        (a, b) =>
          Number(b.store_id === row.store_id) - Number(a.store_id === row.store_id) ||
          a.wine_name.localeCompare(b.wine_name) ||
          (a.vintage ?? 0) - (b.vintage ?? 0),
      )
      .slice(0, 40)
    const out: Suggestion<ReceiveRow>[] = hits.map((i) => ({
      key: i.id,
      label: wineLabel(i),
      detail: `${storeName(stores, i.store_id)} · Rack ${i.rack ?? '-'} · ${i.country ?? '-'}`,
      aside: `คงเหลือ ${i.balance}`,
      apply: (r) => ({
        ...r,
        store_id: i.store_id,
        rack: i.rack,
        country: i.country,
        wine_name: i.wine_name,
        vintage: i.vintage,
        rating_rp: i.rating_rp,
        rating_ws: i.rating_ws,
        maturity_from: i.maturity_from,
        maturity_to: i.maturity_to,
        price_per_bottle: r.price_per_bottle ?? i.price_per_bottle,
        supplier: r.supplier ?? i.supplier,
      }),
    }))
    const exact = items.some((i) => i.wine_name.toLowerCase() === ql)
    if (q.trim() && !exact) {
      out.unshift({
        key: '__new',
        label: `+ เพิ่มไวน์ใหม่ “${q.trim()}”`,
        detail: 'ยังไม่มีในสต็อก จะสร้างรายการใหม่เมื่อบันทึก',
        apply: (r) => ({ ...r, wine_name: q.trim() }),
      })
    }
    return out
  }
}

export function ReceivePage() {
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions(false))
  const post = usePostReceipt()

  const stores = useMemo(() => storesQ.data ?? [], [storesQ.data])
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const lookups = useMemo(() => buildLookups(items), [items])
  const byIdentity = useMemo(() => new Map(items.map((i) => [identityKey(i), i])), [items])

  const [draft] = useState(loadReceiveDraft)
  const [rows, setRows] = useState<ReceiveRow[]>(
    () => draft?.rows ?? Array.from({ length: START_ROWS }, () => newReceiveRow(null)),
  )
  const [receivedAt, setReceivedAt] = useState(draft?.receivedAt ?? todayIso())
  const [note, setNote] = useState(draft?.note ?? '')
  const [defaultStore, setDefaultStore] = useState<number | null>(draft?.defaultStore ?? null)
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (defaultStore != null || !stores.length) return
    const id = stores[0].id
    setDefaultStore(id)
    setRows((rs) => rs.map((r) => (r.store_id == null && isBlankRow(r) ? { ...r, store_id: id } : r)))
  }, [stores, defaultStore])

  useEffect(() => {
    const filled = rows.some((r) => !isBlankRow(r)) || note
    saveReceiveDraft(filled ? { rows, receivedAt, note, defaultStore } : null)
  }, [rows, receivedAt, note, defaultStore])

  const filled = useMemo(() => rows.filter((r) => !isBlankRow(r)), [rows])
  const errors = useMemo(() => new Map(filled.map((r) => [r._id, validateReceiveRow(r)])), [filled])
  const errorRows = filled.filter((r) => Object.keys(errors.get(r._id) ?? {}).length > 0).length

  const matchOf = useCallback(
    (r: ReceiveRow) => (r.wine_name?.trim() && r.store_id ? byIdentity.get(identityKey(r)) : undefined),
    [byIdentity],
  )

  // ไวน์เดิม: ช่องที่กรอกค่าต่างจากในสต็อก จะไปทับค่าเดิมตอนบันทึก (ช่องว่าง = คงค่าเดิม)
  const cellChanged = useCallback(
    (r: ReceiveRow, key: string) => {
      const m = matchOf(r)
      if (!m) return false
      if (key === 'maturity') {
        return (
          (r.maturity_from != null && r.maturity_from !== m.maturity_from) ||
          (r.maturity_to != null && r.maturity_to !== m.maturity_to)
        )
      }
      if (!UPDATABLE.includes(key as (typeof UPDATABLE)[number])) return false
      const v = r[key as (typeof UPDATABLE)[number]]
      return v != null && v !== '' && v !== m[key as (typeof UPDATABLE)[number]]
    },
    [matchOf],
  )

  const columns = useMemo(() => {
    const c = wineColumns<ReceiveRow>(stores, lookups)
    const match = matchOf

    const status: GridColumn<ReceiveRow> = {
      key: 'match',
      title: 'สถานะ',
      width: 86,
      readOnly: true,
      filterable: false,
      get: (r) => (isBlankRow(r) ? null : match(r) ? 'เพิ่มยอด' : 'ใหม่'),
      render: (r) =>
        isBlankRow(r) ? null : match(r) ? <Badge tone="info">เพิ่มยอด</Badge> : <Badge tone="gold">ใหม่</Badge>,
    }
    const wine: GridColumn<ReceiveRow> = {
      ...c.wine,
      placeholder: 'พิมพ์เพื่อค้นหาไวน์ในสต็อก…',
      suggest: wineSuggest(items, stores),
    }
    const balance: GridColumn<ReceiveRow> = {
      key: 'balance',
      title: 'Balance',
      subtitle: 'คงเหลือ → หลังรับ',
      width: 110,
      type: 'number',
      align: 'right',
      readOnly: true,
      get: (r) => match(r)?.balance ?? null,
      render: (r) => {
        const m = match(r)
        if (!m && r.qty == null) return null
        const before = m?.balance ?? 0
        return (
          <span className="tabular-nums">
            <span className="text-muted">{fmtInt(before)} → </span>
            <b className="text-brand-800">{fmtInt(before + (r.qty ?? 0))}</b>
          </span>
        )
      },
    }
    const qty: GridColumn<ReceiveRow> = {
      key: 'qty',
      title: 'จำนวนรับ',
      subtitle: 'ขวด',
      width: 88,
      type: 'number',
      align: 'right',
      parse: (t) => {
        const s = t.trim().replace(/,/g, '')
        if (!s) return null
        const n = Number(s)
        return Number.isInteger(n) && n >= 0 ? n : undefined
      },
    }
    return [
      status,
      c.country,
      c.store,
      c.rack,
      wine,
      c.vintage,
      qty,
      balance,
      c.rp,
      c.ws,
      c.maturity,
      c.price,
      c.supplier,
      c.purchaseDate,
      c.remark,
    ]
  }, [stores, lookups, items, matchOf])

  const totals = useMemo(() => {
    const ok = filled.filter((r) => !Object.keys(errors.get(r._id) ?? {}).length)
    const perStore = new Map<number, { lines: number; qty: number; value: number; fresh: number }>()
    for (const r of ok) {
      const s = perStore.get(r.store_id!) ?? { lines: 0, qty: 0, value: 0, fresh: 0 }
      s.lines++
      s.qty += r.qty ?? 0
      s.value += (r.qty ?? 0) * (r.price_per_bottle ?? 0)
      if (!byIdentity.get(identityKey(r))) s.fresh++
      perStore.set(r.store_id!, s)
    }
    return {
      perStore,
      qty: ok.reduce((s, r) => s + (r.qty ?? 0), 0),
      value: ok.reduce((s, r) => s + (r.qty ?? 0) * (r.price_per_bottle ?? 0), 0),
    }
  }, [filled, errors, byIdentity])

  function addRows(n = 5) {
    setRows((rs) => [...rs, ...Array.from({ length: n }, () => newReceiveRow(defaultStore))])
  }

  function reset() {
    setRows(Array.from({ length: START_ROWS }, () => newReceiveRow(defaultStore)))
    setNote('')
    setShowErrors(false)
    saveReceiveDraft(null)
  }

  function trySave() {
    if (!filled.length) return toast.info('ยังไม่มีรายการรับเข้า')
    if (errorRows) {
      setShowErrors(true)
      return toast.error(`มี ${errorRows} แถวที่ข้อมูลยังไม่ครบ ดูช่องที่มีมุมสีแดง`)
    }
    setConfirm(true)
  }

  async function submit() {
    const lines: ReceiptLineInput[] = filled.map((r) => ({
      store_id: r.store_id!,
      rack: r.rack,
      country: r.country,
      wine_name: r.wine_name!.trim(),
      vintage: r.vintage,
      rating_rp: r.rating_rp,
      rating_ws: r.rating_ws,
      maturity_from: r.maturity_from,
      maturity_to: r.maturity_to,
      qty: r.qty!,
      price_per_bottle: r.price_per_bottle,
      supplier: r.supplier,
      purchase_date: r.purchase_date,
      remark: r.remark,
    }))
    const doc = await post.mutateAsync({ receivedAt, note, lines })
    setConfirm(false)
    reset()
    toast.success(`บันทึกรับเข้า ${doc.doc_no} แล้ว`, {
      description: `${lines.length} รายการ · ${fmtInt(lines.reduce((s, l) => s + l.qty, 0))} ขวด`,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="รับเข้าไวน์"
        description={
          <>
            กรอกได้หลายรายการในครั้งเดียว พิมพ์ชื่อไวน์เพื่อค้นหาของที่มีอยู่ ไม่เจอ = เพิ่มใหม่ ·{' '}
            <Link to="/history" search={{ tab: 'receipts' }} className="text-brand-700 underline">
              ดูประวัติรับเข้า
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[160px_220px_1fr]">
        <Field label="วันที่รับเข้า">
          <DateInput value={receivedAt} max={todayIso()} onChange={setReceivedAt} />
        </Field>
        <Field label="คลังตั้งต้นของแถวใหม่">
          <Combobox
            value={defaultStore}
            options={stores.map((st) => ({ value: st.id, label: st.name, hint: st.code }))}
            onChange={(id) => {
              setDefaultStore(id)
              // แถวที่ยังว่างอยู่ ใช้คลังใหม่ไปด้วย
              setRows((rs) => rs.map((r) => (isBlankRow(r) ? { ...r, store_id: id } : r)))
            }}
          />
        </Field>
        <Field label="หมายเหตุ / เลขที่ใบส่งของ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น INV-2026-0912 จาก Wine Connection" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AddRows onAdd={addRows} />
        {selectedIds.length > 0 && rows.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-700"
            onClick={() => {
              const drop = new Set(selectedIds)
              setRows((rs) => {
                const left = rs.filter((r) => !drop.has(r._id))
                return left.length ? left : [newReceiveRow(defaultStore)]
              })
            }}
          >
            <Trash2 className="size-4" /> ลบแถวที่เลือก ({selectedIds.length})
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={reset} disabled={!filled.length}>
          <Eraser className="size-4" /> ล้างทั้งหมด
        </Button>
        <span className="hidden text-xs text-muted lg:inline">
          วางจาก Excel ได้: คลิกเซลล์ Country แถวแรก แล้ว Ctrl+V (เรียงคอลัมน์ตามตาราง)
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-2">
            <b className="tabular-nums">{filled.length}</b> รายการ · <b className="tabular-nums">{fmtInt(totals.qty)}</b> ขวด
          </span>
          <Button variant="primary" onClick={trySave} disabled={!filled.length}>
            <Save className="size-4" /> บันทึกรับเข้า
          </Button>
        </div>
      </div>

      <DataGrid
        className="min-h-[420px] flex-1"
        rows={rows}
        columns={columns}
        getRowId={(r) => r._id}
        onRowsChange={setRows}
        createRow={() => newReceiveRow(defaultStore)}
        onSelectionChange={setSelectedIds}
        pageSizeKey="receive"
        cellError={(r, key) => (showErrors && !isBlankRow(r) ? (errors.get(r._id)?.[key] ?? null) : null)}
        rowStatus={(r) => (!isBlankRow(r) && r.wine_name?.trim() && !matchOf(r) ? 'added' : null)}
        cellChanged={cellChanged}
        statusLabels={{ added: 'ไวน์ใหม่', changed: 'ค่าที่จะอัปเดตไวน์เดิม' }}
      />

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ยืนยันบันทึกรับเข้า"
        description={`วันที่รับ ${receivedAt.split('-').reverse().join('/')}${note ? ` · ${note}` : ''}`}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={post.isPending} onClick={submit}>
              ยืนยันบันทึก
            </Button>
          </>
        }
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">คลัง</th>
              <th className="pb-2 text-right font-medium">รายการ</th>
              <th className="pb-2 text-right font-medium">ไวน์ใหม่</th>
              <th className="pb-2 text-right font-medium">ขวด</th>
              <th className="pb-2 text-right font-medium">มูลค่า</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...totals.perStore.entries()].map(([id, s]) => (
              <tr key={id} className="border-t border-line">
                <td className="py-2">{storeName(stores, id)}</td>
                <td className="py-2 text-right">{s.lines}</td>
                <td className="py-2 text-right">{s.fresh}</td>
                <td className="py-2 text-right">{fmtInt(s.qty)}</td>
                <td className="py-2 text-right">{fmtMoney(s.value)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-strong font-semibold">
              <td className="py-2">รวม</td>
              <td className="py-2 text-right">{filled.length}</td>
              <td />
              <td className="py-2 text-right">{fmtInt(totals.qty)}</td>
              <td className="py-2 text-right">{fmtMoney(totals.value)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">
          รายการที่ตรงกับไวน์เดิม (คลัง + ชื่อ + ปี + rack) จะบวกยอดเข้าไวน์เดิม ที่เหลือสร้างเป็นรายการใหม่
        </p>
      </Dialog>
    </div>
  )
}
