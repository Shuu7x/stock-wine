import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Eraser, Save, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn, Suggestion } from '@/components/data-grid/types'
import { AddRows } from '@/components/ui/add-rows'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { SuggestInput } from '@/components/ui/suggest-input'
import { DateInput } from '@/components/ui/date-input'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { appSettingsOptions, lookupValuesOptions } from '@/features/settings/api/settings.api'
import { stockItemsOptions, storesOptions, type StockItem, type Store } from '@/features/stock/api/stock.api'
import { buildLookups, identityKey, storeName, wineColumns, wineLabel } from '@/features/stock/columns'
import { fmtInt, fmtMoney, todayIso } from '@/lib/format'
import { AttachFiles } from './AttachFiles'
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

const UPDATABLE = ['country', 'rating', 'price_per_bottle', 'supplier', 'purchase_date', 'remark'] as const

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
        rating: i.rating,
        maturity_from: i.maturity_from,
        maturity_to: i.maturity_to,
        price_per_bottle: r.price_per_bottle ?? i.price_per_bottle,
      }),
    }))
    // ไวน์เดิมแต่เก็บที่ชั้นอื่น (ไม่ทับรายการเดิม — ระบบสร้างรายการใหม่ตามคลัง/ชั้นที่เลือก)
    const seen = new Set<string>()
    for (const i of hits) {
      const k = `${i.wine_name.toLowerCase()}|${i.vintage ?? 0}`
      if (seen.has(k) || seen.size >= 3) continue
      seen.add(k)
      out.push({
        key: `${i.id}:rack`,
        label: `${wineLabel(i)} — เก็บที่ชั้นอื่น`,
        detail: 'ไวน์เดิม แต่วางคนละชั้น · เลือก Store / Wine racks เองหลังเลือก',
        aside: 'ชั้นใหม่',
        apply: (r) => ({
          ...r,
          rack: null,
          country: i.country,
          wine_name: i.wine_name,
          vintage: i.vintage,
          rating: i.rating,
          maturity_from: i.maturity_from,
          maturity_to: i.maturity_to,
          price_per_bottle: r.price_per_bottle ?? i.price_per_bottle,
        }),
      })
    }
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
  const lookupQ = useQuery(lookupValuesOptions())
  const lookups = useMemo(() => buildLookups(items, lookupQ.data), [items, lookupQ.data])
  const settingsQ = useQuery(appSettingsOptions())
  const activeStores = useMemo(() => stores.filter((s) => s.is_active), [stores])
  const byIdentity = useMemo(() => new Map(items.map((i) => [identityKey(i), i])), [items])

  const [draft] = useState(loadReceiveDraft)
  const [rows, setRows] = useState<ReceiveRow[]>(
    () => draft?.rows ?? Array.from({ length: START_ROWS }, () => newReceiveRow(null)),
  )
  const [receivedAt, setReceivedAt] = useState(draft?.receivedAt ?? todayIso())
  const [note, setNote] = useState(draft?.note ?? '')
  const [defaultStore, setDefaultStore] = useState<number | null>(draft?.defaultStore ?? null)
  const [supplier, setSupplier] = useState(draft?.supplier ?? '')
  const [purchaseDate, setPurchaseDate] = useState<string | null>(draft?.purchaseDate ?? null)
  // รูปบิลที่แนบ (ไม่เก็บในร่าง — ไฟล์ใหญ่)
  const [files, setFiles] = useState<File[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    // รอค่าตั้งค่า แล้วใช้ "คลังตั้งต้น" ถ้ายังเปิดใช้งานอยู่ ไม่งั้นใช้คลังแรก
    if (defaultStore != null || !activeStores.length || !settingsQ.isFetched) return
    const preferred = settingsQ.data?.default_receive_store_id
    const id = activeStores.find((s) => s.id === preferred)?.id ?? activeStores[0].id
    setDefaultStore(id)
    setRows((rs) => rs.map((r) => (r.store_id == null && isBlankRow(r) ? { ...r, store_id: id } : r)))
  }, [activeStores, defaultStore, settingsQ.isFetched, settingsQ.data])

  useEffect(() => {
    const filled = rows.some((r) => !isBlankRow(r)) || note || supplier
    saveReceiveDraft(filled ? { rows, receivedAt, note, defaultStore, supplier, purchaseDate } : null)
  }, [rows, receivedAt, note, defaultStore, supplier, purchaseDate])

  const filled = useMemo(() => rows.filter((r) => !isBlankRow(r)), [rows])
  const errors = useMemo(() => new Map(filled.map((r) => [r._id, validateReceiveRow(r)])), [filled])
  const errorRows = filled.filter((r) => Object.keys(errors.get(r._id) ?? {}).length > 0).length

  const matchOf = useCallback(
    (r: ReceiveRow) => (r.wine_name?.trim() && r.store_id ? byIdentity.get(identityKey(r)) : undefined),
    [byIdentity],
  )
  /** ไวน์ (ชื่อ+ปี) นี้มีอยู่แล้วแต่คนละคลัง/ชั้น → รับเข้าเป็นรายการใหม่ที่ชั้นนี้ */
  const otherRack = useCallback(
    (r: ReceiveRow) =>
      !!r.wine_name?.trim() &&
      items.some((i) => i.wine_name.trim().toLowerCase() === r.wine_name!.trim().toLowerCase() && (i.vintage ?? 0) === (r.vintage ?? 0)),
    [items],
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
      get: (r) => (isBlankRow(r) ? null : match(r) ? 'เพิ่มยอด' : otherRack(r) ? 'ชั้นใหม่' : 'ใหม่'),
      render: (r) =>
        isBlankRow(r) ? null : match(r) ? (
          <Badge tone="info">เพิ่มยอด</Badge>
        ) : otherRack(r) ? (
          <Badge tone="brand">ชั้นใหม่</Badge>
        ) : (
          <Badge tone="gold">ใหม่</Badge>
        ),
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
      // ข้อมูลไวน์ก่อน แล้วจึงคลัง / ชั้นวาง · จำนวนรับ
      wine,
      c.vintage,
      c.country,
      c.rating,
      c.maturity,
      c.price,
      // กว้างกว่าค่าปกติ: ช่องนี้มีปุ่ม ▾ เลือกคลัง ชื่อคลังจึงไม่ถูกตัด
      { ...c.store, width: 200 },
      c.rack,
      qty,
      balance,
      c.remark,
    ]
  }, [stores, lookups, items, matchOf, otherRack])

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
    setSupplier('')
    setPurchaseDate(null)
    setFiles([])
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
      rating: r.rating,
      maturity_from: r.maturity_from,
      maturity_to: r.maturity_to,
      qty: r.qty!,
      price_per_bottle: r.price_per_bottle,
      // ผู้ขาย / วันที่ซื้อ มาจากหัวเอกสาร
      supplier: null,
      purchase_date: null,
      remark: r.remark,
    }))
    const doc = await post.mutateAsync({ receivedAt, note, supplier, purchaseDate, lines, files })
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

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[160px_minmax(0,1fr)_170px_220px]">
        <Field label="วันที่รับเข้า">
          <DateInput value={receivedAt} max={todayIso()} onChange={setReceivedAt} />
        </Field>
        <Field label="ซื้อจากใคร">
          <SuggestInput
            value={supplier}
            onChange={setSupplier}
            suggestions={lookups.suppliers.map((s) => ({ value: s }))}
            title="ผู้ขายที่เคยซื้อ"
            placeholder="เช่น Wine Connection"
          />
        </Field>
        <Field label="วันที่ซื้อ">
          <div className="relative">
            <DateInput value={purchaseDate ?? ''} max={todayIso()} onChange={setPurchaseDate} />
            {purchaseDate && (
              <button
                type="button"
                aria-label="ล้างวันที่ซื้อ"
                onClick={() => setPurchaseDate(null)}
                className="absolute top-1/2 right-9 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-2"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </Field>
        <Field label="คลังตั้งต้นของแถวใหม่">
          <Combobox
            value={defaultStore}
            options={activeStores.map((st) => ({ value: st.id, label: st.name, hint: st.code }))}
            onChange={(id) => {
              setDefaultStore(id)
              // แถวที่ยังว่างอยู่ ใช้คลังใหม่ไปด้วย
              setRows((rs) => rs.map((r) => (isBlankRow(r) ? { ...r, store_id: id } : r)))
            }}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="หมายเหตุ / เลขที่ใบส่งของ">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น INV-2026-0912" />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-xs font-medium text-ink-2">รูปบิล / ใบส่งของ</span>
          <AttachFiles files={files} onChange={setFiles} />
        </div>
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
          วางจาก Excel ได้: คลิกเซลล์ Name of wine แถวแรก แล้ว Ctrl+V (เรียงคอลัมน์ตามตาราง)
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
        card={{
          noun: 'รายการรับเข้า',
          title: (r) => (r.wine_name ? `${r.wine_name} ${r.vintage ?? ''}`.trim() : <span className="text-muted">ยังไม่ได้ระบุไวน์</span>),
          subtitle: (r) => (r.store_id ? `${storeName(stores, r.store_id)} · Rack ${r.rack ?? '-'}` : null),
          fields: ['qty', 'price_per_bottle', 'rating', 'maturity'],
        }}
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
        description={[
          `วันที่รับ ${receivedAt.split('-').reverse().join('/')}`,
          supplier.trim() && `ซื้อจาก ${supplier.trim()}`,
          purchaseDate && `วันที่ซื้อ ${purchaseDate.split('-').reverse().join('/')}`,
          note,
          files.length > 0 && `แนบ ${files.length} ไฟล์`,
        ]
          .filter(Boolean)
          .join(' · ')}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={post.isPending} onClick={submit}>
              ยืนยันบันทึก
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
        </>
      )}
      </Dialog>
    </div>
  )
}
