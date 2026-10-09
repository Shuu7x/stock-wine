import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Ban } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { DOC_PAGE_SIZES, Pager } from '@/components/ui/pager'
import { Segmented } from '@/components/ui/segmented'
import { receiptsListOptions, useVoidReceipt } from '@/features/receipts/api/receipts.api'
import { storesOptions } from '@/features/stock/api/stock.api'
import { storeName, wineLabel } from '@/features/stock/columns'
import { useVoidWithdrawal, withdrawalsListOptions } from '@/features/withdrawals/api/withdrawals.api'
import { cn } from '@/lib/cn'
import { LogList } from './LogList'
import { fmtDate, fmtDateTime, fmtInt, fmtMaturity, fmtMoney } from '@/lib/format'

export type HistoryTab = 'receipts' | 'withdrawals' | 'logs'


type DocRow = {
  id: string
  doc_no: string
  date: string
  note: string | null
  status: 'posted' | 'void'
  void_reason: string | null
  voided_at: string | null
  created_at: string
  created_by_email: string | null
  lines: Array<{
    id: string
    store_id: number
    wine_name: string
    vintage: number | null
    rack: string | null
    qty: number
    price_per_bottle: number | null
    date?: string
    extra?: string
    isNew?: boolean
    remark: string | null
  }>
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
  const storesQ = useQuery(storesOptions())
  const stores = storesQ.data ?? []
  const receiptsQ = useQuery({ ...receiptsListOptions(page, pageSize), enabled: tab === 'receipts' })
  const withdrawalsQ = useQuery({ ...withdrawalsListOptions(page, pageSize), enabled: tab === 'withdrawals' })
  const voidReceipt = useVoidReceipt()
  const voidWithdrawal = useVoidWithdrawal()

  const [open, setOpen] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<DocRow | null>(null)
  const [reason, setReason] = useState('')

  const docs: DocRow[] =
    tab === 'receipts'
      ? (receiptsQ.data?.items ?? []).map((d) => ({
          id: d.id,
          doc_no: d.doc_no,
          date: d.received_at,
          note: d.note,
          status: d.status,
          void_reason: d.void_reason,
          voided_at: d.voided_at,
          created_at: d.created_at,
          created_by_email: d.created_by_email,
          lines: [...d.receipt_lines]
            .sort((a, b) => a.line_no - b.line_no)
            .map((l) => ({
              id: l.id,
              store_id: l.store_id,
              wine_name: l.wine_name,
              vintage: l.vintage,
              rack: l.rack,
              qty: l.qty,
              price_per_bottle: l.price_per_bottle,
              extra: [l.supplier, fmtMaturity(l.maturity_from, l.maturity_to)].filter(Boolean).join(' · '),
              isNew: l.is_new_item,
              remark: l.remark,
            })),
        }))
      : (withdrawalsQ.data?.items ?? []).map((d) => ({
          id: d.id,
          doc_no: d.doc_no,
          date: new Date(d.created_at).toLocaleDateString('sv-SE'),
          note: d.note,
          status: d.status,
          void_reason: d.void_reason,
          voided_at: d.voided_at,
          created_at: d.created_at,
          created_by_email: d.created_by_email,
          lines: [...d.withdrawal_lines]
            .sort((a, b) => a.line_no - b.line_no)
            .map((l) => ({
              id: l.id,
              store_id: l.store_id,
              wine_name: l.wine_name,
              vintage: l.vintage,
              rack: l.rack,
              qty: l.qty,
              price_per_bottle: l.price_per_bottle,
              date: l.withdraw_date,
              remark: l.remark,
            })),
        }))

  const q = tab === 'receipts' ? receiptsQ : withdrawalsQ
  const total = q.data?.total ?? 0

  async function confirmVoid() {
    if (!voiding) return
    if (tab === 'receipts') await voidReceipt.mutateAsync({ id: voiding.id, reason })
    else await voidWithdrawal.mutateAsync({ id: voiding.id, reason })
    toast.success(`ยกเลิก ${voiding.doc_no} แล้ว ยอดสต็อกถูกปรับกลับ`)
    setVoiding(null)
    setReason('')
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ประวัติ"
        description="เอกสารรับเข้า/เบิก (ยกเลิกได้ ระบบปรับยอดกลับและเก็บเอกสารไว้) และบันทึกทุกการเปลี่ยนแปลงของข้อมูลไวน์"
      />

      <Segmented
        value={tab}
        onChange={(t) => {
          setOpen(null)
          onChange({ tab: t, page: 1 })
        }}
        items={[
          { value: 'receipts', label: 'รับเข้า' },
          { value: 'withdrawals', label: 'เบิก' },
          { value: 'logs', label: 'บันทึกการแก้ไข' },
        ]}
      />

      {tab === 'logs' && <LogList stores={stores} />}

      {tab !== 'logs' && (
      <>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {q.isLoading && <div className="p-8 text-center text-sm text-muted">กำลังโหลด…</div>}
        {!q.isLoading && docs.length === 0 && (
          <div className="p-10 text-center text-sm text-muted">
            ยังไม่มีเอกสาร{tab === 'receipts' ? 'รับเข้า' : 'เบิก'}
          </div>
        )}
        <ul className="divide-y divide-line">
          {docs.map((d) => {
            const qty = d.lines.reduce((s, l) => s + l.qty, 0)
            const value = d.lines.reduce((s, l) => s + l.qty * (l.price_per_bottle ?? 0), 0)
            const isOpen = open === d.id
            return (
              <li key={d.id} className={cn(d.status === 'void' && 'bg-surface-2')}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : d.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <ChevronDown className={cn('size-4 shrink-0 text-muted transition', isOpen && 'rotate-180')} />
                  <span className={cn('font-mono text-sm font-semibold', d.status === 'void' && 'line-through')}>
                    {d.doc_no}
                  </span>
                  {d.status === 'void' ? <Badge tone="danger">ยกเลิก</Badge> : <Badge tone="success">บันทึกแล้ว</Badge>}
                  <span className="text-sm text-ink-2">{fmtDate(d.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{d.note}</span>
                  <span className="text-sm tabular-nums">
                    {d.lines.length} รายการ · <b>{fmtInt(qty)}</b> ขวด
                    <span className="hidden text-muted sm:inline"> · {fmtMoney(value)} บาท</span>
                  </span>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-danger-700"
                          onClick={() => setVoiding(d)}
                        >
                          <Ban className="size-4" /> ยกเลิกเอกสาร
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className="text-left text-xs text-muted">
                          <tr>
                            <th className="py-1.5 pr-2 font-medium">#</th>
                            <th className="py-1.5 pr-2 font-medium">ไวน์</th>
                            <th className="py-1.5 pr-2 font-medium">คลัง · Rack</th>
                            {tab === 'withdrawals' && <th className="py-1.5 pr-2 font-medium">วันที่เบิก</th>}
                            <th className="py-1.5 pr-2 text-right font-medium">ขวด</th>
                            <th className="py-1.5 pr-2 text-right font-medium">ราคา/ขวด</th>
                            <th className="py-1.5 font-medium">หมายเหตุ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((l, i) => (
                            <tr key={l.id} className="border-t border-line align-top">
                              <td className="py-1.5 pr-2 text-muted tabular-nums">{i + 1}</td>
                              <td className="py-1.5 pr-2">
                                <div className="flex items-center gap-2">
                                  {wineLabel(l)}
                                  {l.isNew && <Badge tone="gold">ใหม่</Badge>}
                                </div>
                                {l.extra && <div className="text-xs text-muted">{l.extra}</div>}
                              </td>
                              <td className="py-1.5 pr-2 whitespace-nowrap text-ink-2">
                                {storeName(stores, l.store_id)} · {l.rack ?? '-'}
                              </td>
                              {tab === 'withdrawals' && <td className="py-1.5 pr-2">{fmtDate(l.date)}</td>}
                              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{l.qty}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(l.price_per_bottle)}</td>
                              <td className="py-1.5 text-ink-2">{l.remark}</td>
                            </tr>
                          ))}
                        </tbody>
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
        description={
          tab === 'receipts'
            ? 'ยอดคงเหลือจะถูกหักกลับตามที่รับเข้า (ทำไม่ได้ถ้าไวน์ถูกเบิกไปแล้วจนเหลือไม่พอ) เอกสารยังเก็บไว้ในประวัติ'
            : 'ยอดคงเหลือจะถูกบวกกลับตามที่เบิก เอกสารยังเก็บไว้ในประวัติ'
        }
        footer={
          <>
            <Button onClick={() => setVoiding(null)}>ไม่ยกเลิก</Button>
            <Button
              variant="danger"
              loading={voidReceipt.isPending || voidWithdrawal.isPending}
              onClick={confirmVoid}
            >
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
