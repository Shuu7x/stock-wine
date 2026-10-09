import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  ChevronRight,
  ClipboardCheck,
  FileX2,
  GlassWater,
  History,
  PackagePlus,
  ShoppingBag,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { Dialog } from '@/components/ui/dialog'
import { Drawer } from '@/components/ui/drawer'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { DOC_PAGE_SIZES, Pager } from '@/components/ui/pager'
import { Segmented } from '@/components/ui/segmented'
import {
  adjustmentsListOptions,
  salesListOptions,
  transfersListOptions,
  useVoidAdjustment,
  useVoidSale,
  useVoidTransfer,
} from '@/features/operations/api/operations.api'
import { receiptsListOptions, useVoidReceipt } from '@/features/receipts/api/receipts.api'
import { storesOptions, type Store } from '@/features/stock/api/stock.api'
import { storeName, wineLabel } from '@/features/stock/columns'
import { useVoidWithdrawal, withdrawalsListOptions } from '@/features/withdrawals/api/withdrawals.api'
import { cn } from '@/lib/cn'
import type { DocFilter } from '@/lib/doc-filter'
import { fmtDate, fmtDateTime, fmtInt, fmtMaturity, fmtMoney, todayIso } from '@/lib/format'
import { VAT_MODE_LABEL } from '@/lib/vat'
import { LogList } from './LogList'

export const HISTORY_TABS = ['receipts', 'sales', 'withdrawals', 'transfers', 'adjustments', 'logs'] as const
export type HistoryTab = (typeof HISTORY_TABS)[number]
type DocTab = Exclude<HistoryTab, 'logs'>

const TAB: Record<HistoryTab, { label: string; icon: LucideIcon }> = {
  receipts: { label: 'รับเข้า', icon: PackagePlus },
  sales: { label: 'ขาย', icon: ShoppingBag },
  withdrawals: { label: 'เบิก', icon: GlassWater },
  transfers: { label: 'โอนย้าย', icon: ArrowLeftRight },
  adjustments: { label: 'ปรับยอด', icon: ClipboardCheck },
  logs: { label: 'บันทึกการแก้ไข', icon: History },
}

const VOID_HINT: Record<DocTab, string> = {
  receipts: 'ยอดคงเหลือจะถูกหักกลับตามที่รับเข้า (ทำไม่ได้ถ้าไวน์ถูกเบิกไปแล้วจนเหลือไม่พอ)',
  withdrawals: 'ยอดคงเหลือจะถูกบวกกลับตามที่เบิก',
  sales: 'ยอดคงเหลือจะถูกบวกกลับตามที่ขาย',
  transfers: 'ไวน์จะถูกย้ายกลับไปคลังต้นทาง (ทำไม่ได้ถ้าปลายทางเหลือไม่พอ)',
  adjustments: 'ยอดคงเหลือจะถูกปรับกลับเป็นก่อนปรับยอด',
}

type Col = { label: string; right?: boolean }

/** เอกสารทุกประเภทแปลงเป็นรูปเดียวกันก่อนแสดง */
type DocView = {
  id: string
  doc_no: string
  date: string
  status: 'posted' | 'void'
  note: string | null
  party?: string | null
  void_reason: string | null
  voided_at: string | null
  created_at: string
  created_by_email: string | null
  lineCount: number
  /** จำนวนที่แสดงในรายการ เช่น "12 ขวด" หรือ "+2 −1" */
  qty: ReactNode
  amount: number | null
  meta: Array<[string, ReactNode]>
  cols: Col[]
  lines: ReactNode[][]
  footer?: ReactNode[]
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
const place = (stores: Store[], storeId: number, rack: string | null) => `${storeName(stores, storeId)} · ${rack ?? '-'}`
const localDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE')
const wineCell = (l: { wine_name: string; vintage: number | null }, sub?: string | null, badge?: ReactNode) => (
  <>
    <div className="flex flex-wrap items-center gap-1.5 font-medium">
      {wineLabel(l)}
      {badge}
    </div>
    {sub && <div className="text-xs text-muted">{sub}</div>}
  </>
)
const bottles = (n: number) => (
  <>
    <b className="tabular-nums">{fmtInt(n)}</b> ขวด
  </>
)

export function HistoryPage({
  tab,
  page,
  pageSize,
  onChange,
}: {
  tab: HistoryTab
  page: number
  pageSize: number
  onChange: (next: { tab?: HistoryTab; page?: number; pageSize?: number }) => void
}) {
  const stores = useQuery(storesOptions()).data ?? []
  const [filter, setFilter] = useState<DocFilter>({})
  const q = {
    receipts: useQuery({ ...receiptsListOptions(page, pageSize, filter), enabled: tab === 'receipts' }),
    withdrawals: useQuery({ ...withdrawalsListOptions(page, pageSize, filter), enabled: tab === 'withdrawals' }),
    sales: useQuery({ ...salesListOptions(page, pageSize, filter), enabled: tab === 'sales' }),
    transfers: useQuery({ ...transfersListOptions(page, pageSize, filter), enabled: tab === 'transfers' }),
    adjustments: useQuery({ ...adjustmentsListOptions(page, pageSize, filter), enabled: tab === 'adjustments' }),
  }
  const voids = {
    receipts: useVoidReceipt(),
    withdrawals: useVoidWithdrawal(),
    sales: useVoidSale(),
    transfers: useVoidTransfer(),
    adjustments: useVoidAdjustment(),
  }

  const [openId, setOpenId] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<DocView | null>(null)
  const [reason, setReason] = useState('')

  function docs(): DocView[] {
    const base = <T extends { created_by_email: string | null; created_at: string }>(d: T): Array<[string, ReactNode]> => [
      ['บันทึกโดย', d.created_by_email ?? '–'],
      ['เวลาบันทึก', fmtDateTime(d.created_at)],
    ]
    switch (tab) {
      case 'receipts':
        return (q.receipts.data?.items ?? []).map((d) => {
          const ls = [...d.receipt_lines].sort((a, b) => a.line_no - b.line_no)
          const value = sum(ls, (l) => l.qty * (l.price_per_bottle ?? 0))
          return {
            ...d,
            date: d.received_at,
            lineCount: ls.length,
            qty: bottles(sum(ls, (l) => l.qty)),
            amount: value,
            meta: [['วันที่รับเข้า', fmtDate(d.received_at)], ...base(d), ['มูลค่ารวม', `${fmtMoney(value)} บาท`]],
            cols: [{ label: 'ไวน์' }, { label: 'คลัง · Rack' }, { label: 'ขวด', right: true }, { label: 'ราคา/ขวด', right: true }],
            lines: ls.map((l) => [
              wineCell(
                l,
                [l.supplier, fmtMaturity(l.maturity_from, l.maturity_to), l.remark].filter(Boolean).join(' · '),
                l.is_new_item ? <Badge tone="gold">ใหม่</Badge> : null,
              ),
              place(stores, l.store_id, l.rack),
              <b>{l.qty}</b>,
              fmtMoney(l.price_per_bottle),
            ]),
          }
        })
      case 'withdrawals':
        return (q.withdrawals.data?.items ?? []).map((d) => {
          const ls = [...d.withdrawal_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: localDate(d.created_at),
            lineCount: ls.length,
            qty: bottles(sum(ls, (l) => l.qty)),
            amount: null,
            meta: base(d),
            cols: [{ label: 'ไวน์' }, { label: 'คลัง · Rack' }, { label: 'วันที่เบิก' }, { label: 'ขวด', right: true }],
            lines: ls.map((l) => [wineCell(l, l.remark), place(stores, l.store_id, l.rack), fmtDate(l.withdraw_date), <b>{l.qty}</b>]),
          }
        })
      case 'sales':
        return (q.sales.data?.items ?? []).map((d) => {
          const ls = [...d.sale_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: d.sold_at,
            party: d.customer,
            lineCount: ls.length,
            qty: bottles(sum(ls, (l) => l.qty)),
            amount: d.total,
            meta: [
              ['ลูกค้า', d.customer ?? '–'],
              ['วันที่ขาย', fmtDate(d.sold_at)],
              ['ราคาที่กรอก', `${VAT_MODE_LABEL[d.vat_mode]} (VAT ${d.vat_rate}%)`],
              ...base(d),
            ],
            cols: [
              { label: 'ไวน์' },
              { label: 'ขวด', right: true },
              { label: 'ราคา/ขวด', right: true },
              { label: 'VAT', right: true },
              { label: 'รวม', right: true },
            ],
            lines: ls.map((l) => [
              wineCell(l, [place(stores, l.store_id, l.rack), l.remark].filter(Boolean).join(' · ')),
              <b>{l.qty}</b>,
              fmtMoney(l.unit_price),
              l.has_vat ? fmtMoney(l.vat_amount) : <span className="text-muted">ไม่มี</span>,
              <b>{fmtMoney(l.line_total)}</b>,
            ]),
            footer: [
              'ยอดก่อน VAT / VAT / รวม',
              '',
              fmtMoney(d.subtotal),
              fmtMoney(d.vat_amount),
              <span className="text-base text-brand-900">{fmtMoney(d.total)}</span>,
            ],
          }
        })
      case 'transfers':
        return (q.transfers.data?.items ?? []).map((d) => {
          const ls = [...d.transfer_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: d.transferred_at,
            lineCount: ls.length,
            qty: bottles(sum(ls, (l) => l.qty)),
            amount: null,
            meta: [['วันที่โอนย้าย', fmtDate(d.transferred_at)], ...base(d)],
            cols: [{ label: 'ไวน์' }, { label: 'จาก → ไป' }, { label: 'ขวด', right: true }],
            lines: ls.map((l) => [
              wineCell(l, l.remark, l.to_is_new_item ? <Badge tone="gold">สร้างใหม่</Badge> : null),
              <span className="flex flex-wrap items-center gap-1 text-ink-2">
                {place(stores, l.from_store_id, l.from_rack)}
                <ArrowRight className="size-3.5 text-muted" />
                {place(stores, l.to_store_id, l.to_rack)}
              </span>,
              <b>{l.qty}</b>,
            ]),
          }
        })
      case 'adjustments':
        return (q.adjustments.data?.items ?? []).map((d) => {
          const ls = [...d.stock_adjustment_lines].sort((a, b) => a.line_no - b.line_no)
          const plus = sum(ls, (l) => Math.max(0, l.diff))
          const minus = sum(ls, (l) => Math.min(0, l.diff))
          return {
            ...d,
            date: d.adjusted_at,
            lineCount: ls.length,
            qty: (
              <span className="tabular-nums">
                {plus > 0 && <b className="text-info-600">+{plus}</b>}
                {plus > 0 && minus < 0 && ' '}
                {minus < 0 && <b className="text-danger-700">{minus}</b>} ขวด
              </span>
            ),
            amount: null,
            meta: [['วันที่ปรับยอด', fmtDate(d.adjusted_at)], ...base(d)],
            cols: [{ label: 'ไวน์' }, { label: 'ในระบบ → นับได้', right: true }, { label: 'ผลต่าง', right: true }, { label: 'สาเหตุ' }],
            lines: ls.map((l) => [
              wineCell(l, [place(stores, l.store_id, l.rack), l.remark].filter(Boolean).join(' · ')),
              `${l.balance_before} → ${l.balance_after}`,
              <b className={l.diff > 0 ? 'text-info-600' : 'text-danger-700'}>{l.diff > 0 ? `+${l.diff}` : l.diff}</b>,
              l.reason,
            ]),
          }
        })
      default:
        return []
    }
  }

  const isDocTab = tab !== 'logs'
  const query = isDocTab ? q[tab] : null
  const list = isDocTab ? docs() : []
  const total = query?.data?.total ?? 0
  const open = list.find((d) => d.id === openId) ?? null
  const hasMoney = tab === 'receipts' || tab === 'sales'
  const filtered = !!(filter.status || filter.from || filter.to)

  function setF(next: DocFilter) {
    setFilter(next)
    onChange({ page: 1 })
  }

  async function confirmVoid() {
    if (!voiding || !isDocTab) return
    await voids[tab].mutateAsync({ id: voiding.id, reason })
    toast.success(`ยกเลิก ${voiding.doc_no} แล้ว ยอดสต็อกถูกปรับกลับ`)
    setVoiding(null)
    setReason('')
  }

  const Icon = TAB[tab].icon

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader title="ประวัติ" description="เอกสารทุกประเภทและบันทึกการเปลี่ยนแปลงของข้อมูลไวน์ · ยกเลิกเอกสารได้ ระบบปรับยอดกลับและเก็บเอกสารไว้" />

      {/* แท็บ */}
      <div className="no-scrollbar -mx-4 shrink-0 overflow-x-auto overflow-y-hidden border-b border-line px-4 sm:mx-0 sm:px-0" role="tablist">
        <div className="flex w-max gap-1">
          {HISTORY_TABS.map((t) => {
            const T = TAB[t]
            const active = t === tab
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setOpenId(null)
                  onChange({ tab: t, page: 1 })
                }}
                className={cn(
                  'relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition',
                  active ? 'text-brand-800' : 'text-ink-2 hover:text-ink',
                  t === 'logs' && 'ml-2 border-l border-line pl-4',
                )}
              >
                <T.icon className={cn('size-4', active ? 'text-brand-700' : 'text-muted')} />
                {T.label}
                {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-700" />}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'logs' && <LogList stores={stores} fill />}

      {isDocTab && (
        <>
          {/* ตัวกรอง */}
          <div className="flex shrink-0 flex-wrap items-end gap-3">
            <Field label="ตั้งแต่วันที่" className="w-40">
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
                  { value: 'posted', label: 'บันทึกแล้ว' },
                  { value: 'void', label: 'ยกเลิก' },
                ]}
              />
            </div>
            {filtered && (
              <Button variant="ghost" onClick={() => setF({})}>
                <X className="size-4" /> ล้างตัวกรอง
              </Button>
            )}
            <span className="ml-auto pb-2 text-sm text-muted">{fmtInt(total)} เอกสาร</span>
          </div>

          {/* รายการเอกสาร */}
          <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
            <div
              className={cn(
                'hidden shrink-0 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted md:grid',
                'grid-cols-[minmax(140px,1fr)_100px_minmax(0,2fr)_110px_120px_96px_16px] gap-4',
              )}
            >
              <span>เลขที่</span>
              <span>วันที่</span>
              <span>{tab === 'sales' ? 'ลูกค้า / หมายเหตุ' : 'หมายเหตุ'}</span>
              <span className="text-right">จำนวน</span>
              <span className="text-right">{hasMoney ? 'ยอดเงิน' : ''}</span>
              <span>สถานะ</span>
              <span />
            </div>

            {query?.isLoading && <div className="p-10 text-center text-sm text-muted">กำลังโหลด…</div>}
            {!query?.isLoading && list.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted">
                <FileX2 className="size-10 text-line-strong" />
                {filtered ? 'ไม่พบเอกสารตามตัวกรอง' : `ยังไม่มีเอกสาร${TAB[tab].label}`}
              </div>
            )}

            <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
              {list.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(d.id)}
                    className={cn(
                      'grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition hover:bg-brand-50/50',
                      'md:grid-cols-[minmax(140px,1fr)_100px_minmax(0,2fr)_110px_120px_96px_16px]',
                      d.status === 'void' && 'text-muted',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          d.status === 'void' ? 'bg-surface-3 text-muted' : 'bg-brand-50 text-brand-700',
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className={cn('truncate font-mono font-semibold', d.status === 'void' && 'line-through')}>{d.doc_no}</span>
                      {/* มือถือไม่มีคอลัมน์สถานะ แสดงป้ายข้างเลขที่แทน */}
                      {d.status === 'void' && (
                        <Badge tone="danger" className="md:hidden">
                          ยกเลิก
                        </Badge>
                      )}
                    </span>
                    <span className="text-right text-ink-2 md:text-left">{fmtDate(d.date)}</span>
                    <span className="col-span-2 min-w-0 truncate md:col-span-1">
                      {d.party && <span className="font-medium text-ink">{d.party}</span>}
                      {d.party && d.note && <span className="text-muted"> · </span>}
                      <span className="text-muted">{d.note ?? (d.party ? '' : '–')}</span>
                    </span>
                    <span className="text-ink-2 md:text-right">
                      {d.lineCount} รายการ · {d.qty}
                    </span>
                    <span className="text-right font-semibold tabular-nums">{d.amount != null ? fmtMoney(d.amount) : ''}</span>
                    <span className="hidden md:block">
                      {d.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>}
                    </span>
                    <ChevronRight className="hidden size-4 text-muted md:block" />
                  </button>
                </li>
              ))}
            </ul>

            {total > 0 && (
              <Pager
                className="shrink-0 justify-end border-t border-line bg-surface-2 px-4 py-2"
                page={page}
                pageSize={pageSize}
                total={total}
                unit="เอกสาร"
                options={DOC_PAGE_SIZES}
                onPage={(p) => onChange({ page: p })}
                onPageSize={(n) => onChange({ pageSize: n, page: 1 })}
              />
            )}
          </div>
        </>
      )}

      {/* รายละเอียดเอกสาร */}
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        header={
          open && (
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-gold-100">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('font-mono text-lg font-bold', open.status === 'void' && 'line-through')}>{open.doc_no}</span>
                  {open.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>}
                </div>
                <div className="text-sm text-muted">
                  {TAB[tab].label} · {fmtDate(open.date)}
                </div>
              </div>
            </div>
          )
        }
        footer={
          open && (
            <>
              {open.status === 'posted' && (
                <Button variant="ghost" className="text-danger-700" onClick={() => setVoiding(open)}>
                  <Ban className="size-4" /> ยกเลิกเอกสาร
                </Button>
              )}
              <Button className="ml-auto" onClick={() => setOpenId(null)}>
                ปิด
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="flex flex-col gap-5">
            {open.status === 'void' && (
              <div className="rounded-lg border border-danger-600/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
                ยกเลิกเมื่อ {fmtDateTime(open.voided_at)}
                {open.void_reason ? ` — ${open.void_reason}` : ''}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {open.meta.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="truncate font-medium">{v}</dd>
                </div>
              ))}
              {open.note && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">หมายเหตุ</dt>
                  <dd className="font-medium">{open.note}</dd>
                </div>
              )}
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold">
                รายการ ({open.lineCount}) · {open.qty}
              </h3>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      {open.cols.map((c, i) => (
                        <th key={i} className={cn('px-3 py-2 font-medium', c.right && 'text-right')}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {open.lines.map((cells, i) => (
                      <tr key={i} className="align-top">
                        <td className="px-3 py-2 text-muted tabular-nums">{i + 1}</td>
                        {cells.map((cell, j) => (
                          <td key={j} className={cn('px-3 py-2', open.cols[j]?.right && 'text-right tabular-nums')}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {open.footer && (
                    <tfoot>
                      <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                        <td />
                        {open.footer.map((cell, j) => (
                          <td key={j} className={cn('px-3 py-2', open.cols[j]?.right && 'text-right tabular-nums')}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <Dialog
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title={`ยกเลิกเอกสาร ${voiding?.doc_no ?? ''}?`}
        description={isDocTab ? `${VOID_HINT[tab]} · เอกสารยังเก็บไว้ในประวัติ` : undefined}
        footer={
          <>
            <Button onClick={() => setVoiding(null)}>ไม่ยกเลิก</Button>
            <Button variant="danger" loading={isDocTab && voids[tab].isPending} onClick={confirmVoid}>
              ยืนยันยกเลิก
            </Button>
          </>
        }
      >
        <Field label="เหตุผล">
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น บันทึกซ้ำ / กรอกจำนวนผิด" />
        </Field>
      </Dialog>
    </div>
  )
}
