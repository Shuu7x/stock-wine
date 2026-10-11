import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileX2, Printer, Receipt, Search, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { matchesWords } from '@/components/data-grid/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { DOC_PAGE_SIZES, Pager } from '@/components/ui/pager'
import { Segmented } from '@/components/ui/segmented'
import type { SaleWithLines } from '@/features/operations/api/operations.api'
import { cn } from '@/lib/cn'
import type { DocFilter } from '@/lib/doc-filter'
import { fmtDate, fmtInt, fmtMoney, todayIso } from '@/lib/format'
import { billsListOptions, unbilledSalesOptions, useIssueBills, type BillGroup } from '../api/billing.api'
import { BillDialog } from './BillDialog'
import { Loading } from '@/components/ui/loading'

export type BillingTab = 'pending' | 'issued'
type Mode = 'per_customer' | 'per_sale'

const NO_CUSTOMER = '(ไม่ระบุลูกค้า)'
const customerKey = (s: { customer: string | null }) => s.customer?.trim() || NO_CUSTOMER
const qtyOf = (s: SaleWithLines) => s.sale_lines.reduce((a, l) => a + l.qty, 0)

export function BillingPage({ tab, onTab }: { tab: BillingTab; onTab: (t: BillingTab) => void }) {
  const [printIds, setPrintIds] = useState<string[] | null>(null)
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="ออกบิล"
        description="ขายไปก่อนแล้วค่อยออกบิลทีหลังได้ · เลือกหลายใบขายแล้วออกบิลแยกใบ หรือรวมเป็นบิลเดียวต่อลูกค้า"
      />
      <Segmented
        className="shrink-0"
        value={tab}
        onChange={onTab}
        items={[
          { value: 'pending', label: 'รอออกบิล' },
          { value: 'issued', label: 'บิลที่ออกแล้ว' },
        ]}
      />
      {tab === 'pending' ? <PendingTab onIssued={setPrintIds} /> : <IssuedTab onOpen={setPrintIds} />}
      <BillDialog billIds={printIds} onClose={() => setPrintIds(null)} />
    </div>
  )
}

// ─── รอออกบิล ──────────────────────────────────────────────────────────────

function PendingTab({ onIssued }: { onIssued: (ids: string[]) => void }) {
  const salesQ = useQuery(unbilledSalesOptions())
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [issuing, setIssuing] = useState(false)

  const sales = useMemo(
    () =>
      (salesQ.data ?? []).filter(
        (s) =>
          (!q.trim() || matchesWords(`${s.customer ?? ''} ${s.doc_no} ${s.note ?? ''}`, q)) &&
          (!from || s.sold_at >= from) &&
          (!to || s.sold_at <= to),
      ),
    [salesQ.data, q, from, to],
  )
  const groups = useMemo(() => {
    const m = new Map<string, SaleWithLines[]>()
    for (const s of sales) m.set(customerKey(s), [...(m.get(customerKey(s)) ?? []), s])
    return [...m.entries()].sort(([a], [b]) => (a === NO_CUSTOMER ? 1 : b === NO_CUSTOMER ? -1 : a.localeCompare(b, 'th')))
  }, [sales])

  const all = salesQ.data ?? []
  const chosen = all.filter((s) => picked.has(s.id))
  const chosenCustomers = new Set(chosen.map(customerKey)).size
  const chosenTotal = chosen.reduce((a, s) => a + s.total, 0)

  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const filtered = !!(q || from || to)

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาลูกค้า เลขใบขาย หมายเหตุ…" className="pl-9" />
        </label>
        <Field label="ขายตั้งแต่วันที่" className="w-40">
          <DateInput value={from} max={to || todayIso()} onChange={setFrom} />
        </Field>
        <Field label="ถึงวันที่" className="w-40">
          <DateInput value={to} max={todayIso()} onChange={setTo} />
        </Field>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ('')
              setFrom('')
              setTo('')
            }}
          >
            <X className="size-4" /> ล้างตัวกรอง
          </Button>
        )}
        <span className="ml-auto pb-2 text-sm text-muted">
          รอออกบิล {fmtInt(all.length)} ใบขาย
        </span>
      </div>

      <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div className="min-h-0 flex-1 overflow-auto">
          {salesQ.isLoading && <Loading />}
          {!salesQ.isLoading && !groups.length && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted">
              <FileX2 className="size-10 text-line-strong" />
              {filtered ? 'ไม่พบใบขายตามตัวกรอง' : 'ไม่มีใบขายที่รอออกบิล'}
              {!filtered && (
                <Link to="/sale" className="font-medium text-brand-700 underline">
                  ไปหน้าขาย
                </Link>
              )}
            </div>
          )}
          {groups.map(([customer, list]) => {
            const ids = list.map((s) => s.id)
            const allOn = ids.every((id) => picked.has(id))
            const someOn = ids.some((id) => picked.has(id))
            return (
              <section key={customer} className="border-b border-line last:border-b-0">
                <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-700"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn && !allOn
                    }}
                    onChange={() => toggle(ids, !allOn)}
                    aria-label={`เลือกทุกใบขายของ ${customer}`}
                  />
                  <Users className="size-4 text-muted" />
                  <span className={cn('font-semibold', customer === NO_CUSTOMER && 'text-muted')}>{customer}</span>
                  <span className="text-sm text-muted">{list.length} ใบขาย</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(list.reduce((a, s) => a + s.total, 0))}</span>
                </label>
                <ul className="divide-y divide-line">
                  {list.map((s) => (
                    <li key={s.id}>
                      <label
                        className={cn(
                          'grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 pl-11 text-sm transition hover:bg-brand-50/40',
                          'md:grid-cols-[auto_150px_100px_minmax(0,1fr)_140px_120px]',
                          picked.has(s.id) && 'bg-brand-50/60',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-brand-700"
                          checked={picked.has(s.id)}
                          onChange={(e) => toggle([s.id], e.target.checked)}
                        />
                        <span className="font-mono font-semibold">{s.doc_no}</span>
                        <span className="text-right text-ink-2 md:text-left">{fmtDate(s.sold_at)}</span>
                        <span className="col-span-2 min-w-0 truncate pl-8 text-muted md:col-span-1 md:pl-0">{s.note ?? ''}</span>
                        <span className="text-ink-2 md:text-right">
                          {s.sale_lines.length} รายการ · <b>{fmtInt(qtyOf(s))}</b> ขวด
                        </span>
                        <span className="text-right font-semibold tabular-nums">{fmtMoney(s.total)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>

        {/* แถบทำรายการกับที่เลือก */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-4 py-2.5">
          {chosen.length ? (
            <>
              <span className="text-sm">
                เลือก <b className="tabular-nums">{chosen.length}</b> ใบขาย จาก <b className="tabular-nums">{chosenCustomers}</b> ลูกค้า · รวม{' '}
                <b className="text-brand-800 tabular-nums">{fmtMoney(chosenTotal)}</b> บาท
              </span>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                ล้างที่เลือก
              </Button>
              <Button variant="primary" className="ml-auto" onClick={() => setIssuing(true)}>
                <Receipt className="size-4" /> ออกบิล
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted">ติ๊กใบขายที่จะออกบิล หรือติ๊กที่ชื่อลูกค้าเพื่อเลือกทั้งหมดของลูกค้านั้น</span>
          )}
        </div>
      </div>

      <IssueDialog
        open={issuing}
        sales={chosen}
        onClose={() => setIssuing(false)}
        onDone={(ids) => {
          setIssuing(false)
          setPicked(new Set())
          onIssued(ids)
        }}
      />
    </>
  )
}

function IssueDialog({
  open,
  sales,
  onClose,
  onDone,
}: {
  open: boolean
  sales: SaleWithLines[]
  onClose: () => void
  onDone: (billIds: string[]) => void
}) {
  const issue = useIssueBills()
  const [mode, setMode] = useState<Mode>('per_customer')
  const [issuedAt, setIssuedAt] = useState(todayIso())
  const [note, setNote] = useState('')

  // แต่ละกลุ่ม = บิลหนึ่งใบ
  const groups = useMemo(() => {
    if (mode === 'per_sale') return sales.map((s) => ({ customer: customerKey(s), sales: [s] }))
    const m = new Map<string, SaleWithLines[]>()
    for (const s of sales) m.set(customerKey(s), [...(m.get(customerKey(s)) ?? []), s])
    return [...m.entries()].map(([customer, list]) => ({ customer, sales: list }))
  }, [sales, mode])

  async function submit() {
    const payload: BillGroup[] = groups.map((g) => ({
      sale_ids: g.sales.map((s) => s.id),
      customer: g.customer === NO_CUSTOMER ? null : g.customer,
      note: note || null,
    }))
    const bills = await issue.mutateAsync({ issuedAt, groups: payload })
    toast.success(`ออกบิล ${bills.length} ใบแล้ว`, { description: bills.map((b) => b.bill_no).join(', ') })
    setNote('')
    onDone(bills.map((b) => b.id))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`ออกบิลจาก ${sales.length} ใบขาย`}
      description="ออกแล้วเปิดหน้าพิมพ์บิลทุกใบให้ทันที"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={issue.isPending} onClick={submit} disabled={!groups.length}>
            <Printer className="size-4" /> ออกบิล {groups.length} ใบ และพิมพ์
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">รูปแบบ</span>
          <Segmented
            className="!mx-0 !px-0"
            value={mode}
            onChange={setMode}
            items={[
              { value: 'per_customer', label: 'รวมเป็นบิลเดียวต่อลูกค้า' },
              { value: 'per_sale', label: 'แยกบิลละใบขาย' },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
          <Field label="วันที่ออกบิล">
            <DateInput value={issuedAt} max={todayIso()} onChange={setIssuedAt} />
          </Field>
          <Field label="หมายเหตุในบิล (ทุกใบ)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ชำระภายใน 30 วัน" />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">จะได้บิล {groups.length} ใบ</div>
          <ul className="max-h-[40dvh] divide-y divide-line overflow-auto rounded-lg border border-line">
            {groups.map((g, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className={cn('font-medium', g.customer === NO_CUSTOMER && 'text-muted')}>{g.customer}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{g.sales.map((s) => s.doc_no).join(', ')}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(g.sales.reduce((a, s) => a + s.total, 0))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  )
}

// ─── บิลที่ออกแล้ว ─────────────────────────────────────────────────────────

function IssuedTab({ onOpen }: { onOpen: (ids: string[]) => void }) {
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [filter, setFilter] = useState<DocFilter>({})
  const q = useQuery(billsListOptions(page, size, filter))
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const list = q.data?.items ?? []
  const total = q.data?.total ?? 0
  const setF = (f: DocFilter) => {
    setFilter(f)
    setPage(1)
  }
  const filtered = !!(filter.status || filter.from || filter.to)
  const allOn = list.length > 0 && list.every((b) => picked.has(b.id))

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-end gap-3">
        <Field label="ออกบิลตั้งแต่วันที่" className="w-40">
          <DateInput value={filter.from ?? ''} max={filter.to ?? todayIso()} onChange={(v) => setF({ ...filter, from: v })} />
        </Field>
        <Field label="ถึงวันที่" className="w-40">
          <DateInput value={filter.to ?? ''} max={todayIso()} onChange={(v) => setF({ ...filter, to: v })} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">สถานะ</span>
          <Segmented
            className="!mx-0 !px-0"
            value={filter.status ?? 'all'}
            onChange={(v) => setF({ ...filter, status: v === 'all' ? undefined : v })}
            items={[
              { value: 'all', label: 'ทั้งหมด' },
              { value: 'posted', label: 'ใช้งาน' },
              { value: 'void', label: 'ยกเลิก' },
            ]}
          />
        </div>
        {filtered && (
          <Button variant="ghost" onClick={() => setF({})}>
            <X className="size-4" /> ล้างตัวกรอง
          </Button>
        )}
        <span className="ml-auto pb-2 text-sm text-muted">{fmtInt(total)} บิล</span>
      </div>

      <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <div className="hidden shrink-0 grid-cols-[auto_150px_100px_minmax(0,1fr)_90px_130px_90px] gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted md:grid">
          <input
            type="checkbox"
            className="size-4 accent-brand-700"
            checked={allOn}
            onChange={() => setPicked(allOn ? new Set() : new Set(list.map((b) => b.id)))}
            aria-label="เลือกทั้งหมดในหน้านี้"
          />
          <span>เลขที่บิล</span>
          <span>วันที่</span>
          <span>ลูกค้า</span>
          <span className="text-right">ใบขาย</span>
          <span className="text-right">ยอดรวม</span>
          <span>สถานะ</span>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
          {q.isLoading && (
            <li className="h-full">
              <Loading />
            </li>
          )}
          {!q.isLoading && !list.length && (
            <li className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted">
              <FileX2 className="size-10 text-line-strong" />
              {filtered ? 'ไม่พบบิลตามตัวกรอง' : 'ยังไม่มีบิล'}
            </li>
          )}
          {list.map((b) => (
            <li
              key={b.id}
              className={cn(
                'grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 text-sm transition hover:bg-brand-50/40',
                'md:grid-cols-[auto_150px_100px_minmax(0,1fr)_90px_130px_90px]',
                b.status === 'void' && 'text-muted',
              )}
              onClick={() => onOpen([b.id])}
            >
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={picked.has(b.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  setPicked((p) => {
                    const next = new Set(p)
                    if (e.target.checked) next.add(b.id)
                    else next.delete(b.id)
                    return next
                  })
                }
                aria-label={`เลือก ${b.bill_no}`}
              />
              <span className={cn('font-mono font-semibold', b.status === 'void' && 'line-through')}>{b.bill_no}</span>
              <span className="text-right text-ink-2 md:text-left">{fmtDate(b.issued_at)}</span>
              <span className="col-span-2 min-w-0 truncate pl-8 font-medium md:col-span-1 md:pl-0">{b.customer ?? '–'}</span>
              <span className="text-ink-2 md:text-right">{b.sale_count} ใบขาย</span>
              <span className="text-right font-semibold tabular-nums">{fmtMoney(b.total)}</span>
              <span className="hidden md:block">
                {b.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">ใช้งาน</Badge>}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-4 py-2">
          {picked.size > 0 && (
            <>
              <span className="text-sm">
                เลือก <b>{picked.size}</b> บิล
              </span>
              <Button size="sm" onClick={() => onOpen([...picked])}>
                <Printer className="size-4" /> พิมพ์ที่เลือก
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                ล้าง
              </Button>
            </>
          )}
          {total > 0 && (
            <Pager
              className="ml-auto"
              page={page}
              pageSize={size}
              total={total}
              unit="บิล"
              options={DOC_PAGE_SIZES}
              onPage={setPage}
              onPageSize={(n) => {
                setSize(n)
                setPage(1)
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
