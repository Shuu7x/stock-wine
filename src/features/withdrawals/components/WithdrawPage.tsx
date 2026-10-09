import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Eraser, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn, Suggestion } from '@/components/data-grid/types'
import { formatValue, getValue } from '@/components/data-grid/utils'
import { AddRows } from '@/components/ui/add-rows'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { lookupValuesOptions, useAppSettings } from '@/features/settings/api/settings.api'
import { stockItemsOptions, storesOptions, type StockItem } from '@/features/stock/api/stock.api'
import { buildLookups, storeName, wineColumns, wineLabel } from '@/features/stock/columns'
import { fmtInt, fmtMoney, todayIso } from '@/lib/format'
import { usePostWithdrawal, type WithdrawalLineInput } from '../api/withdrawals.api'

type WithdrawRow = {
  _id: string
  stock_item_id: string | null
  /** ชื่อที่พิมพ์/วางมาแต่ยังจับคู่กับสต็อกไม่ได้ */
  wine_text: string | null
  qty: number | null
  withdraw_date: string | null
  remark: string | null
}

const newRow = (stockItemId: string | null = null, qty: number | null = null): WithdrawRow => ({
  _id: crypto.randomUUID(),
  stock_item_id: stockItemId,
  wine_text: null,
  qty,
  withdraw_date: todayIso(),
  remark: null,
})

const isBlank = (r: WithdrawRow) => !r.stock_item_id && !r.wine_text?.trim() && r.qty == null && !r.remark

const DRAFT_KEY = 'stock-wine:withdraw-draft:v1'
type Draft = { rows: WithdrawRow[]; note: string }
function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}
function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ไม่เก็บร่าง */
  }
}

export function WithdrawPage({ prefillIds }: { prefillIds: string[] }) {
  const navigate = useNavigate()
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions(false))
  const post = usePostWithdrawal()

  const stores = useMemo(() => storesQ.data ?? [], [storesQ.data])
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const lookupQ = useQuery(lookupValuesOptions())
  const lookups = useMemo(() => buildLookups(items, lookupQ.data), [items, lookupQ.data])
  const { require_withdraw_note: noteRequired } = useAppSettings()
  const [noteError, setNoteError] = useState(false)

  const [draft] = useState(loadDraft)
  const [rows, setRows] = useState<WithdrawRow[]>(() => draft?.rows ?? Array.from({ length: 6 }, () => newRow()))
  const [note, setNote] = useState(draft?.note ?? '')
  const [scope, setScope] = useState<number | 0>(0)
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // มาจากหน้าสต็อก (เลือกแถวแล้วกด "เบิก") — เติมแถวแล้วล้าง query ทิ้ง
  useEffect(() => {
    if (!prefillIds.length) return
    setRows((rs) => {
      const have = new Set(rs.map((r) => r.stock_item_id))
      const add = prefillIds.filter((id) => !have.has(id)).map((id) => newRow(id, 1))
      const kept = rs.filter((r) => !isBlank(r))
      return [...kept, ...add, ...Array.from({ length: 3 }, () => newRow())]
    })
    navigate({ to: '/withdraw', search: {}, replace: true })
  }, [prefillIds, navigate])

  useEffect(() => {
    const filled = rows.some((r) => !isBlank(r)) || note
    saveDraft(filled ? { rows, note } : null)
  }, [rows, note])

  const filled = useMemo(() => rows.filter((r) => !isBlank(r)), [rows])

  const errors = useMemo(() => {
    const used = new Map<string, number>()
    for (const r of filled) if (r.stock_item_id) used.set(r.stock_item_id, (used.get(r.stock_item_id) ?? 0) + (r.qty ?? 0))
    const out = new Map<string, Record<string, string>>()
    for (const r of filled) {
      const e: Record<string, string> = {}
      const it = r.stock_item_id ? byId.get(r.stock_item_id) : undefined
      if (!it) e.wine = r.wine_text ? 'ไม่พบในสต็อก หรือมีหลายรายการชื่อนี้ — เลือกจากรายการ' : 'เลือกไวน์'
      if (r.qty == null) e.qty = 'ระบุจำนวนที่เบิก'
      else if (!Number.isInteger(r.qty) || r.qty <= 0) e.qty = 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0'
      else if (it && (used.get(it.id) ?? 0) > it.balance) e.qty = `เกินยอดคงเหลือ (เหลือ ${it.balance} ขวด)`
      if (!r.withdraw_date) e.withdraw_date = 'ระบุวันที่เบิก'
      if (Object.keys(e).length) out.set(r._id, e)
    }
    return out
  }, [filled, byId])

  const columns = useMemo(() => {
    const c = wineColumns<StockItem>(stores, lookups)
    const item = (r: WithdrawRow) => (r.stock_item_id ? byId.get(r.stock_item_id) : undefined)
    const lift = (col: GridColumn<StockItem>): GridColumn<WithdrawRow> => ({
      key: col.key,
      title: col.title,
      subtitle: col.subtitle,
      width: col.width,
      type: col.type,
      align: col.align,
      readOnly: true,
      get: (r) => {
        const it = item(r)
        return it ? getValue(col, it) : null
      },
      format: (_v, r) => {
        const it = item(r)
        return it ? formatValue(col, it) : ''
      },
      filterValue: col.filterValue
        ? (r) => {
            const it = item(r)
            return it ? col.filterValue!(it) : ''
          }
        : undefined,
      render: col.render
        ? (r) => {
            const it = item(r)
            return it ? col.render!(it) : null
          }
        : undefined,
    })

    const pool = () => items.filter((i) => i.balance > 0 && (!scope || i.store_id === scope))

    const wine: GridColumn<WithdrawRow> = {
      key: 'wine',
      title: 'Name of wine',
      subtitle: 'ค้นหาจากสต็อก',
      width: 300,
      placeholder: 'พิมพ์ชื่อไวน์…',
      get: (r) => item(r)?.wine_name ?? r.wine_text,
      render: (r) =>
        item(r) ? item(r)!.wine_name : r.wine_text ? <span className="text-danger-700">{r.wine_text}</span> : null,
      // พิมพ์/วางชื่อเอง: ถ้าตรงกับไวน์ในสต็อกรายการเดียว ผูกให้อัตโนมัติ
      set: (r, v) => {
        const text = String(v ?? '').trim()
        if (!text) return { ...r, stock_item_id: null, wine_text: null }
        const t = text.toLowerCase()
        const hits = pool().filter((i) => i.wine_name.toLowerCase() === t || wineLabel(i).toLowerCase() === t)
        return hits.length === 1
          ? { ...r, stock_item_id: hits[0].id, wine_text: null }
          : { ...r, stock_item_id: null, wine_text: text }
      },
      suggest: (q) => {
        const ql = q.toLowerCase()
        return pool()
          .filter((i) => !ql || `${i.wine_name} ${i.vintage ?? 'nv'} ${i.country ?? ''} ${i.rack ?? ''}`.toLowerCase().includes(ql))
          .sort((a, b) => a.wine_name.localeCompare(b.wine_name) || a.store_id - b.store_id)
          .slice(0, 40)
          .map<Suggestion<WithdrawRow>>((i) => ({
            key: i.id,
            label: wineLabel(i),
            detail: `${storeName(stores, i.store_id)} · Rack ${i.rack ?? '-'} · ${i.country ?? '-'}`,
            aside: `คงเหลือ ${i.balance}`,
            apply: (r) => ({ ...r, stock_item_id: i.id, wine_text: null, qty: r.qty ?? 1 }),
          }))
      },
    }
    const balance: GridColumn<WithdrawRow> = {
      key: 'balance',
      title: 'Balance',
      subtitle: 'คงเหลือ → หลังเบิก',
      width: 116,
      type: 'number',
      align: 'right',
      readOnly: true,
      get: (r) => item(r)?.balance ?? null,
      render: (r) => {
        const it = item(r)
        if (!it) return null
        const after = it.balance - (r.qty ?? 0)
        return (
          <span className="tabular-nums">
            <span className="text-muted">{fmtInt(it.balance)} → </span>
            <b className={after < 0 ? 'text-danger-700' : 'text-brand-800'}>{fmtInt(after)}</b>
          </span>
        )
      },
    }
    const qty: GridColumn<WithdrawRow> = {
      key: 'qty',
      title: 'จำนวนเบิก',
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
    }
    const date: GridColumn<WithdrawRow> = {
      key: 'withdraw_date',
      title: 'วันที่เบิก',
      width: 120,
      type: 'date',
      align: 'center',
      placeholder: 'วว/ดด/ปปปป',
    }
    const remark: GridColumn<WithdrawRow> = {
      key: 'remark',
      title: 'Remark',
      subtitle: 'โอกาส / ผู้ดื่ม',
      width: 220,
    }
    return [
      lift(c.country),
      lift(c.store),
      lift(c.rack),
      wine,
      lift(c.vintage),
      balance,
      qty,
      date,
      lift(c.rp),
      lift(c.ws),
      lift(c.maturity),
      lift(c.price),
      lift(c.supplier),
      lift(c.purchaseDate),
      remark,
    ]
  }, [stores, lookups, items, byId, scope])

  const totalQty = filled.reduce((s, r) => s + (r.qty ?? 0), 0)
  const totalValue = filled.reduce(
    (s, r) => s + (r.qty ?? 0) * ((r.stock_item_id && byId.get(r.stock_item_id)?.price_per_bottle) || 0),
    0,
  )

  function reset() {
    setRows(Array.from({ length: 6 }, () => newRow()))
    setNote('')
    setShowErrors(false)
    saveDraft(null)
  }

  function trySave() {
    if (!filled.length) return toast.info('ยังไม่มีรายการเบิก')
    if (noteRequired && !note.trim()) {
      setNoteError(true)
      return toast.error('ต้องกรอกหมายเหตุ / ผู้เบิก ก่อนบันทึก (ตั้งค่าไว้ในหน้าตั้งค่า)')
    }
    if (errors.size) {
      setShowErrors(true)
      return toast.error(`มี ${errors.size} แถวที่ยังไม่ถูกต้อง ดูช่องที่มีมุมสีแดง`)
    }
    setConfirm(true)
  }

  async function submit() {
    const lines: WithdrawalLineInput[] = filled.map((r) => ({
      stock_item_id: r.stock_item_id!,
      qty: r.qty!,
      withdraw_date: r.withdraw_date!,
      remark: r.remark,
    }))
    const doc = await post.mutateAsync({ note, lines })
    setConfirm(false)
    reset()
    toast.success(`บันทึกเบิก ${doc.doc_no} แล้ว`, {
      description: `${lines.length} รายการ · ${fmtInt(lines.reduce((s, l) => s + l.qty, 0))} ขวด`,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="เบิกไวน์"
        description={
          <>
            เบิกออกไปดื่ม เลือกไวน์จากสต็อกได้หลายรายการ ·{' '}
            <Link to="/history" search={{ tab: 'withdrawals' }} className="text-brand-700 underline">
              ดูประวัติการเบิก
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[220px_1fr]">
        <Field label="ค้นหาไวน์จากคลัง">
          <Combobox
            value={scope}
            onChange={setScope}
            options={[
              { value: 0, label: 'ทุกคลัง (All Stock Wines)' },
              ...stores.filter((st) => st.is_active).map((st) => ({ value: st.id, label: st.name, hint: st.code })),
            ]}
          />
        </Field>
        <Field
          label={noteRequired ? 'หมายเหตุ / ผู้เบิก / โอกาส *' : 'หมายเหตุ / ผู้เบิก / โอกาส'}
          error={noteError && !note.trim() ? 'ต้องกรอกช่องนี้' : undefined}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น งานเลี้ยงลูกค้า 12 ต.ค. — คุณสมชาย" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AddRows onAdd={(n) => setRows((rs) => [...rs, ...Array.from({ length: n }, () => newRow())])} />
        {selectedIds.length > 0 && rows.length > 1 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-700"
            onClick={() => {
              const drop = new Set(selectedIds)
              setRows((rs) => {
                const left = rs.filter((r) => !drop.has(r._id))
                return left.length ? left : [newRow()]
              })
            }}
          >
            <Trash2 className="size-4" /> ลบแถวที่เลือก ({selectedIds.length})
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={reset} disabled={!filled.length}>
          <Eraser className="size-4" /> ล้างทั้งหมด
        </Button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-2">
            <b className="tabular-nums">{filled.length}</b> รายการ · <b className="tabular-nums">{fmtInt(totalQty)}</b> ขวด
          </span>
          <Button variant="primary" onClick={trySave} disabled={!filled.length}>
            <Save className="size-4" /> บันทึกการเบิก
          </Button>
        </div>
      </div>

      <DataGrid
        className="min-h-[380px] flex-1"
        rows={rows}
        columns={columns}
        getRowId={(r) => r._id}
        onRowsChange={setRows}
        createRow={() => newRow()}
        onSelectionChange={setSelectedIds}
        pageSizeKey="withdraw"
        cellError={(r, key) => (showErrors && !isBlank(r) ? (errors.get(r._id)?.[key] ?? null) : null)}
      />

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="ยืนยันบันทึกการเบิก"
        description={note || undefined}
        size="lg"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>กลับไปแก้ไข</Button>
            <Button variant="primary" loading={post.isPending} onClick={submit}>
              ยืนยันเบิก
            </Button>
          </>
        }
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">ไวน์</th>
              <th className="hidden pb-2 font-medium sm:table-cell">คลัง</th>
              <th className="pb-2 text-right font-medium">เบิก</th>
              <th className="pb-2 text-right font-medium">เหลือ</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {filled.map((r) => {
              const it = byId.get(r.stock_item_id!)!
              return (
                <tr key={r._id} className="border-t border-line">
                  <td className="py-2 pr-2">{wineLabel(it)}</td>
                  <td className="hidden py-2 text-muted sm:table-cell">{storeName(stores, it.store_id)}</td>
                  <td className="py-2 text-right">{r.qty}</td>
                  <td className="py-2 text-right">{it.balance - (r.qty ?? 0)}</td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-line-strong font-semibold">
              <td className="py-2">รวม · มูลค่า {fmtMoney(totalValue)} บาท</td>
              <td className="hidden sm:table-cell" />
              <td className="py-2 text-right">{fmtInt(totalQty)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Dialog>
    </div>
  )
}
