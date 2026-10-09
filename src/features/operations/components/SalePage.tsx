import { Link } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Combobox } from '@/components/ui/combobox'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { DocToolbar } from '@/components/ui/doc-toolbar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { Segmented } from '@/components/ui/segmented'
import { useAppSettings } from '@/features/settings/api/settings.api'
import { storeName, wineLabel } from '@/features/stock/columns'
import { makePicker, useStockData, wineError, type PickerRow } from '@/features/stock/item-picker'
import { usePrefillRows } from '@/features/stock/use-prefill'
import type { VatMode } from '@/lib/database.types'
import { fmtInt, fmtMoney, todayIso } from '@/lib/format'
import { useInitialDraft, usePersistDraft } from '@/lib/use-local-draft'
import { lineVat, sumVat, VAT_MODE_LABEL } from '@/lib/vat'
import { usePostSale } from '../api/operations.api'

type SaleRow = PickerRow & { qty: number | null; unit_price: number | null; has_vat: boolean; remark: string | null }
type Draft = { rows: SaleRow[]; soldAt: string; customer: string; note: string; vatMode: VatMode | null }

const DRAFT_KEY = 'stock-wine:sale-draft:v1'
const HAS_VAT = 'มี VAT'
const NO_VAT = 'ไม่มี VAT'

const newRow = (stockItemId: string | null = null): SaleRow => ({
  _id: crypto.randomUUID(),
  stock_item_id: stockItemId,
  wine_text: null,
  qty: stockItemId ? 1 : null,
  unit_price: null,
  has_vat: true,
  remark: null,
})
const isBlank = (r: SaleRow) => !r.stock_item_id && !r.wine_text?.trim() && r.qty == null && r.unit_price == null && !r.remark

const money = (t: string) => {
  const s = t.trim().replace(/[,\s฿]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function SalePage({ prefillIds }: { prefillIds: string[] }) {
  const { stores, items, byId, lookups } = useStockData()
  const settings = useAppSettings()
  const post = usePostSale()

  const draft = useInitialDraft<Draft>(DRAFT_KEY)
  const [rows, setRows] = useState<SaleRow[]>(() => draft?.rows ?? Array.from({ length: 6 }, () => newRow()))
  const [soldAt, setSoldAt] = useState(draft?.soldAt ?? todayIso())
  const [customer, setCustomer] = useState(draft?.customer ?? '')
  const [note, setNote] = useState(draft?.note ?? '')
  const [vatModeChoice, setVatMode] = useState<VatMode | null>(draft?.vatMode ?? null)
  const vatMode = vatModeChoice ?? settings.default_vat_mode
  const rate = settings.vat_rate
  const [scope, setScope] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  usePrefillRows({ ids: prefillIds, to: '/sale', setRows, makeRow: newRow, isBlank })

  const filled = useMemo(() => rows.filter((r) => !isBlank(r)), [rows])
  const hasContent = filled.length > 0 || !!customer || !!note
  const draftValue = useMemo(() => ({ rows, soldAt, customer, note, vatMode: vatModeChoice }), [rows, soldAt, customer, note, vatModeChoice])
  usePersistDraft(DRAFT_KEY, draftValue, !hasContent)

  // ยอดของแต่ละแถว (ต้องมีทั้งจำนวนและราคา)
  const calc = useCallback(
    (r: SaleRow) => (r.qty != null && r.unit_price != null ? lineVat(r.qty, r.unit_price, r.has_vat, vatMode, rate) : null),
    [vatMode, rate],
  )

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
      if (r.unit_price == null) e.unit_price = 'ระบุราคาขาย'
      if (Object.keys(e).length) out.set(r._id, e)
    }
    return out
  }, [filled, byId])

  const columns = useMemo(() => {
    const p = makePicker<SaleRow>({
      stores,
      lookups,
      byId,
      pool: () => items.filter((i) => i.balance > 0 && (!scope || i.store_id === scope)),
      onPick: (r) => ({ ...r, qty: r.qty ?? 1 }),
    })
    const ro = (key: string, title: string, get: (r: SaleRow) => number | null, extra?: Partial<GridColumn<SaleRow>>): GridColumn<SaleRow> => ({
      key,
      title,
      width: 112,
      type: 'number',
      align: 'right',
      readOnly: true,
      get,
      format: (v) => fmtMoney(v as number | null),
      ...extra,
    })
    const list: GridColumn<SaleRow>[] = [
      p.lift(p.c.store),
      p.lift(p.c.rack),
      p.wine,
      p.lift(p.c.vintage),
      p.balance('คงเหลือ → หลังขาย', (r, it) => it.balance - (r.qty ?? 0)),
      {
        key: 'qty',
        title: 'จำนวน',
        subtitle: 'ขวด',
        width: 80,
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
        key: 'unit_price',
        title: 'ราคาขาย/ขวด',
        subtitle: vatMode === 'included' ? 'รวม VAT' : 'ก่อน VAT',
        width: 124,
        type: 'number',
        align: 'right',
        parse: money,
        format: (v) => fmtMoney(v as number | null),
      },
      {
        key: 'has_vat',
        title: 'VAT',
        subtitle: `${rate}%`,
        width: 110,
        type: 'select',
        options: [HAS_VAT, NO_VAT],
        get: (r) => (r.has_vat ? HAS_VAT : NO_VAT),
        set: (r, v) => ({ ...r, has_vat: v !== NO_VAT }),
      },
      ro('before', 'ก่อน VAT', (r) => calc(r)?.before ?? null),
      ro('vat', 'VAT', (r) => calc(r)?.vat ?? null, { width: 96 }),
      ro('total', 'รวม', (r) => calc(r)?.total ?? null, {
        render: (r) => <b className="text-brand-800">{fmtMoney(calc(r)?.total ?? null)}</b>,
      }),
      p.lift(p.c.price, { key: 'cost', title: 'ต้นทุน/ขวด', subtitle: 'Price/Btl.' }),
      ro('profit', 'กำไรขั้นต้น', (r) => {
        const it = p.item(r)
        const c = calc(r)
        return it && c && it.price_per_bottle != null ? c.before - it.price_per_bottle * (r.qty ?? 0) : null
      }, {
        subtitle: 'ก่อน VAT − ต้นทุน',
        render: (r) => {
          const it = p.item(r)
          const c = calc(r)
          if (!it || !c || it.price_per_bottle == null) return null
          const v = c.before - it.price_per_bottle * (r.qty ?? 0)
          return <span className={v < 0 ? 'text-danger-700' : 'text-success-700'}>{fmtMoney(v)}</span>
        },
      }),
      { key: 'remark', title: 'Remark', subtitle: 'หมายเหตุ', width: 200 },
    ]
    return list
  }, [stores, lookups, byId, items, scope, vatMode, rate, calc])

  const totals = useMemo(() => {
    const ok = filled.map(calc).filter((x) => x !== null)
    return { ...sumVat(ok), qty: filled.reduce((s, r) => s + (r.qty ?? 0), 0) }
  }, [filled, calc])

  function reset() {
    setRows(Array.from({ length: 6 }, () => newRow()))
    setCustomer('')
    setNote('')
    setVatMode(null)
    setShowErrors(false)
  }

  function trySave() {
    if (!filled.length) return toast.info('ยังไม่มีรายการขาย')
    if (errors.size) {
      setShowErrors(true)
      return toast.error(`มี ${errors.size} แถวที่ยังไม่ถูกต้อง ดูช่องที่มีมุมสีแดง`)
    }
    setConfirm(true)
  }

  async function submit() {
    const doc = await post.mutateAsync({
      soldAt,
      customer,
      note,
      vatMode,
      lines: filled.map((r) => ({
        stock_item_id: r.stock_item_id!,
        qty: r.qty!,
        unit_price: r.unit_price!,
        has_vat: r.has_vat,
        remark: r.remark,
      })),
    })
    setConfirm(false)
    reset()
    toast.success(`บันทึกขาย ${doc.doc_no} แล้ว`, { description: `ยอดรวม ${fmtMoney(doc.total)} บาท` })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="ขายไวน์"
        description={
          <>
            ขายได้หลายรายการในใบเดียว ติ๊ก VAT ได้ทีละรายการ ·{' '}
            <Link to="/history" search={{ tab: 'sales' }} className="text-brand-700 underline">
              ดูประวัติการขาย
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-2 xl:grid-cols-[160px_1fr_1fr_220px_auto]">
        <Field label="วันที่ขาย">
          <DateInput value={soldAt} max={todayIso()} onChange={setSoldAt} />
        </Field>
        <Field label="ลูกค้า">
          <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="ชื่อลูกค้า / บริษัท" />
        </Field>
        <Field label="หมายเหตุ">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เลขที่ออเดอร์" />
        </Field>
        <Field label="ค้นหาไวน์จากคลัง">
          <Combobox
            value={scope}
            onChange={setScope}
            options={[
              { value: 0, label: 'ทุกคลัง' },
              ...stores.filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name, hint: s.code })),
            ]}
          />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">ราคาที่กรอก (VAT {rate}%)</span>
          <Segmented
            className="!mx-0 !px-0"
            value={vatMode}
            onChange={setVatMode}
            items={[
              { value: 'included', label: 'รวม VAT' },
              { value: 'excluded', label: 'ไม่รวม VAT' },
            ]}
          />
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
        canClear={hasContent}
        summary={
          <span className="flex flex-wrap items-center gap-x-3 tabular-nums">
            <span>
              <b>{filled.length}</b> รายการ · <b>{fmtInt(totals.qty)}</b> ขวด
            </span>
            <span className="text-muted">ก่อน VAT {fmtMoney(totals.before)}</span>
            <span className="text-muted">VAT {fmtMoney(totals.vat)}</span>
            <span>
              รวม <b className="text-base text-brand-800">{fmtMoney(totals.total)}</b>
            </span>
          </span>
        }
        saveLabel="บันทึกการขาย"
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
        pageSizeKey="sale"
        cellError={(r, key) => (showErrors && !isBlank(r) ? (errors.get(r._id)?.[key] ?? null) : null)}
      />

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ยืนยันบันทึกการขาย"
        description={[customer, VAT_MODE_LABEL[vatMode], note].filter(Boolean).join(' · ')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={post.isPending} onClick={submit}>
              ยืนยันขาย
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
              <th className="hidden pb-2 font-medium sm:table-cell">คลัง</th>
              <th className="pb-2 text-right font-medium">ขวด</th>
              <th className="pb-2 text-right font-medium">VAT</th>
              <th className="pb-2 text-right font-medium">รวม</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filled.map((r) => {
              const it = byId.get(r.stock_item_id!)!
              const c = calc(r)!
              return (
                <tr key={r._id} className="border-t border-line">
                  <td className="py-2 pr-2">{wineLabel(it)}</td>
                  <td className="hidden py-2 text-muted sm:table-cell">{storeName(stores, it.store_id)}</td>
                  <td className="py-2 text-right">{r.qty}</td>
                  <td className="py-2 text-right">{r.has_vat ? fmtMoney(c.vat) : '–'}</td>
                  <td className="py-2 text-right">{fmtMoney(c.total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="tabular-nums">
            <tr className="border-t-2 border-line-strong">
              <td className="pt-2" colSpan={2}>
                ยอดก่อน VAT
              </td>
              <td className="hidden sm:table-cell" />
              <td />
              <td className="pt-2 text-right">{fmtMoney(totals.before)}</td>
            </tr>
            <tr>
              <td colSpan={2}>VAT {rate}%</td>
              <td className="hidden sm:table-cell" />
              <td />
              <td className="text-right">{fmtMoney(totals.vat)}</td>
            </tr>
            <tr className="text-base font-semibold text-brand-900">
              <td colSpan={2}>ยอดรวม</td>
              <td className="hidden sm:table-cell" />
              <td />
              <td className="text-right">{fmtMoney(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-3 text-xs text-muted">ยอดจริงคำนวณโดยระบบตอนบันทึก (ปัดทีละรายการ 2 ตำแหน่ง)</p>
        </>
      )}
      </Dialog>
    </div>
  )
}
