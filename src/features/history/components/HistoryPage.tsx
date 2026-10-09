import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Ban, ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
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
import { fmtDate, fmtDateTime, fmtInt, fmtMaturity, fmtMoney } from '@/lib/format'
import { VAT_MODE_LABEL } from '@/lib/vat'
import { LogList } from './LogList'

export const HISTORY_TABS = ['receipts', 'withdrawals', 'sales', 'transfers', 'adjustments', 'logs'] as const
export type HistoryTab = (typeof HISTORY_TABS)[number]
type DocTab = Exclude<HistoryTab, 'logs'>

const TAB_LABEL: Record<HistoryTab, string> = {
  receipts: 'รับเข้า',
  withdrawals: 'เบิก',
  sales: 'ขาย',
  transfers: 'โอนย้าย',
  adjustments: 'ปรับยอด',
  logs: 'บันทึกการแก้ไข',
}

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
  summary: ReactNode
  lines: ReactNode[][]
  /** แถวสรุปท้ายตาราง (เช่น ยอด VAT ของใบขาย) */
  footer?: ReactNode[]
}

type Col = { label: string; right?: boolean }

const wineCell = (l: { wine_name: string; vintage: number | null }, sub?: string | null, badge?: ReactNode) => (
  <>
    <div className="flex items-center gap-2">
      {wineLabel(l)}
      {badge}
    </div>
    {sub && <div className="text-xs text-muted">{sub}</div>}
  </>
)
const place = (stores: Store[], storeId: number, rack: string | null) => `${storeName(stores, storeId)} · ${rack ?? '-'}`
const localDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE')
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0)
const bottles = (lines: number, qty: number) => (
  <>
    {lines} รายการ · <b>{fmtInt(qty)}</b> ขวด
  </>
)

const COLS: Record<DocTab, Col[]> = {
  receipts: [{ label: 'ไวน์' }, { label: 'คลัง · Rack' }, { label: 'ขวด', right: true }, { label: 'ราคา/ขวด', right: true }, { label: 'หมายเหตุ' }],
  withdrawals: [{ label: 'ไวน์' }, { label: 'คลัง · Rack' }, { label: 'วันที่เบิก' }, { label: 'ขวด', right: true }, { label: 'หมายเหตุ' }],
  sales: [
    { label: 'ไวน์' },
    { label: 'คลัง · Rack' },
    { label: 'ขวด', right: true },
    { label: 'ราคา/ขวด', right: true },
    { label: 'VAT', right: true },
    { label: 'รวม', right: true },
    { label: 'หมายเหตุ' },
  ],
  transfers: [{ label: 'ไวน์' }, { label: 'จาก' }, { label: '' }, { label: 'ไป' }, { label: 'ขวด', right: true }, { label: 'หมายเหตุ' }],
  adjustments: [
    { label: 'ไวน์' },
    { label: 'คลัง · Rack' },
    { label: 'ในระบบ → นับได้', right: true },
    { label: 'ผลต่าง', right: true },
    { label: 'สาเหตุ' },
    { label: 'หมายเหตุ' },
  ],
}

const VOID_HINT: Record<DocTab, string> = {
  receipts: 'ยอดคงเหลือจะถูกหักกลับตามที่รับเข้า (ทำไม่ได้ถ้าไวน์ถูกเบิกไปแล้วจนเหลือไม่พอ)',
  withdrawals: 'ยอดคงเหลือจะถูกบวกกลับตามที่เบิก',
  sales: 'ยอดคงเหลือจะถูกบวกกลับตามที่ขาย',
  transfers: 'ไวน์จะถูกย้ายกลับไปคลังต้นทาง (ทำไม่ได้ถ้าปลายทางเหลือไม่พอ)',
  adjustments: 'ยอดคงเหลือจะถูกปรับกลับเป็นก่อนปรับยอด',
}

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
  const q = {
    receipts: useQuery({ ...receiptsListOptions(page, pageSize), enabled: tab === 'receipts' }),
    withdrawals: useQuery({ ...withdrawalsListOptions(page, pageSize), enabled: tab === 'withdrawals' }),
    sales: useQuery({ ...salesListOptions(page, pageSize), enabled: tab === 'sales' }),
    transfers: useQuery({ ...transfersListOptions(page, pageSize), enabled: tab === 'transfers' }),
    adjustments: useQuery({ ...adjustmentsListOptions(page, pageSize), enabled: tab === 'adjustments' }),
  }
  const voids = {
    receipts: useVoidReceipt(),
    withdrawals: useVoidWithdrawal(),
    sales: useVoidSale(),
    transfers: useVoidTransfer(),
    adjustments: useVoidAdjustment(),
  }

  const [open, setOpen] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<DocView | null>(null)
  const [reason, setReason] = useState('')

  function docs(): DocView[] {
    switch (tab) {
      case 'receipts':
        return (q.receipts.data?.items ?? []).map((d) => {
          const ls = [...d.receipt_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: d.received_at,
            summary: (
              <>
                {bottles(ls.length, sum(ls, (l) => l.qty))}
                <span className="hidden text-muted sm:inline"> · {fmtMoney(sum(ls, (l) => l.qty * (l.price_per_bottle ?? 0)))} บาท</span>
              </>
            ),
            lines: ls.map((l) => [
              wineCell(
                l,
                [l.supplier, fmtMaturity(l.maturity_from, l.maturity_to)].filter(Boolean).join(' · '),
                l.is_new_item ? <Badge tone="gold">ใหม่</Badge> : null,
              ),
              place(stores, l.store_id, l.rack),
              <b>{l.qty}</b>,
              fmtMoney(l.price_per_bottle),
              l.remark,
            ]),
          }
        })
      case 'withdrawals':
        return (q.withdrawals.data?.items ?? []).map((d) => {
          const ls = [...d.withdrawal_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: localDate(d.created_at),
            summary: bottles(ls.length, sum(ls, (l) => l.qty)),
            lines: ls.map((l) => [wineCell(l), place(stores, l.store_id, l.rack), fmtDate(l.withdraw_date), <b>{l.qty}</b>, l.remark]),
          }
        })
      case 'sales':
        return (q.sales.data?.items ?? []).map((d) => {
          const ls = [...d.sale_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: d.sold_at,
            party: d.customer,
            summary: (
              <>
                {bottles(ls.length, sum(ls, (l) => l.qty))} · <b className="text-brand-800">{fmtMoney(d.total)}</b> บาท
              </>
            ),
            lines: ls.map((l) => [
                wineCell(l),
                place(stores, l.store_id, l.rack),
                <b>{l.qty}</b>,
                fmtMoney(l.unit_price),
                l.has_vat ? fmtMoney(l.vat_amount) : '–',
                <b>{fmtMoney(l.line_total)}</b>,
                l.remark,
              ]),
            footer: [
                <span className="text-xs text-muted">
                  {VAT_MODE_LABEL[d.vat_mode]} · VAT {d.vat_rate}%
                </span>,
                '',
                '',
                <span className="text-muted">ก่อน VAT {fmtMoney(d.subtotal)}</span>,
                <span className="text-muted">{fmtMoney(d.vat_amount)}</span>,
                <b className="text-brand-900">{fmtMoney(d.total)}</b>,
                '',
            ],
          }
        })
      case 'transfers':
        return (q.transfers.data?.items ?? []).map((d) => {
          const ls = [...d.transfer_lines].sort((a, b) => a.line_no - b.line_no)
          return {
            ...d,
            date: d.transferred_at,
            summary: bottles(ls.length, sum(ls, (l) => l.qty)),
            lines: ls.map((l) => [
              wineCell(l, null, l.to_is_new_item ? <Badge tone="gold">สร้างใหม่</Badge> : null),
              place(stores, l.from_store_id, l.from_rack),
              <ArrowRight className="size-3.5 text-muted" />,
              place(stores, l.to_store_id, l.to_rack),
              <b>{l.qty}</b>,
              l.remark,
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
            summary: (
              <>
                {ls.length} รายการ
                {plus > 0 && <b className="ml-2 text-info-600">+{plus}</b>}
                {minus < 0 && <b className="ml-2 text-danger-700">{minus}</b>} ขวด
              </>
            ),
            lines: ls.map((l) => [
              wineCell(l),
              place(stores, l.store_id, l.rack),
              `${l.balance_before} → ${l.balance_after}`,
              <b className={l.diff > 0 ? 'text-info-600' : 'text-danger-700'}>{l.diff > 0 ? `+${l.diff}` : l.diff}</b>,
              l.reason,
              l.remark,
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
  const cols = isDocTab ? COLS[tab] : []

  async function confirmVoid() {
    if (!voiding || !isDocTab) return
    await voids[tab].mutateAsync({ id: voiding.id, reason })
    toast.success(`ยกเลิก ${voiding.doc_no} แล้ว ยอดสต็อกถูกปรับกลับ`)
    setVoiding(null)
    setReason('')
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ประวัติ" description="เอกสารทุกประเภท (ยกเลิกได้ ระบบปรับยอดกลับและเก็บเอกสารไว้) และบันทึกทุกการเปลี่ยนแปลงของข้อมูลไวน์" />

      <Segmented
        value={tab}
        onChange={(t) => {
          setOpen(null)
          onChange({ tab: t, page: 1 })
        }}
        items={HISTORY_TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
      />

      {tab === 'logs' && <LogList stores={stores} />}

      {isDocTab && (
        <>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {query?.isLoading && <div className="p-8 text-center text-sm text-muted">กำลังโหลด…</div>}
            {!query?.isLoading && list.length === 0 && (
              <div className="p-10 text-center text-sm text-muted">ยังไม่มีเอกสาร{TAB_LABEL[tab]}</div>
            )}
            <ul className="divide-y divide-line">
              {list.map((d) => {
                const isOpen = open === d.id
                return (
                  <li key={d.id} className={cn(d.status === 'void' && 'bg-surface-2')}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : d.id)}
                      aria-expanded={isOpen}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface-2"
                    >
                      <ChevronDown className={cn('size-4 shrink-0 text-muted transition', isOpen && 'rotate-180')} />
                      <span className={cn('font-mono text-sm font-semibold', d.status === 'void' && 'line-through')}>{d.doc_no}</span>
                      {d.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>}
                      <span className="text-sm text-ink-2">{fmtDate(d.date)}</span>
                      {d.party && <span className="text-sm font-medium">{d.party}</span>}
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">{d.note}</span>
                      <span className="text-sm tabular-nums">{d.summary}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-line bg-surface-2 px-4 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span>
                            บันทึกโดย {d.created_by_email ?? '-'} · {fmtDateTime(d.created_at)}
                          </span>
                          {d.status === 'void' && (
                            <span className="text-danger-700">
                              ยกเลิกเมื่อ {fmtDateTime(d.voided_at)}
                              {d.void_reason ? ` — ${d.void_reason}` : ''}
                            </span>
                          )}
                          {d.status === 'posted' && (
                            <Button size="sm" variant="ghost" className="ml-auto text-danger-700" onClick={() => setVoiding(d)}>
                              <Ban className="size-4" /> ยกเลิกเอกสาร
                            </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-sm">
                            <thead className="text-left text-xs text-muted">
                              <tr>
                                <th className="py-1.5 pr-2 font-medium">#</th>
                                {cols.map((c, i) => (
                                  <th key={i} className={cn('py-1.5 pr-3 font-medium', c.right && 'text-right')}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {d.lines.map((cells, i) => (
                                <tr key={i} className="border-t border-line align-top">
                                  <td className="py-1.5 pr-2 text-muted tabular-nums">{i + 1}</td>
                                  {cells.map((cell, j) => (
                                    <td key={j} className={cn('py-1.5 pr-3', cols[j]?.right && 'text-right tabular-nums', j === 1 && 'whitespace-nowrap text-ink-2')}>
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                            {d.footer && (
                              <tfoot>
                                <tr className="border-t-2 border-line-strong">
                                  <td />
                                  {d.footer.map((cell, j) => (
                                    <td key={j} className={cn('py-1.5 pr-3', cols[j]?.right && 'text-right tabular-nums')}>
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {total > 0 && (
            <Pager
              className="justify-end"
              page={page}
              pageSize={pageSize}
              total={total}
              unit="เอกสาร"
              options={DOC_PAGE_SIZES}
              onPage={(p) => {
                setOpen(null)
                onChange({ page: p })
              }}
              onPageSize={(n) => onChange({ pageSize: n, page: 1 })}
            />
          )}
        </>
      )}

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
