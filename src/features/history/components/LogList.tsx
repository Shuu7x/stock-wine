import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { DOC_PAGE_SIZES, loadPageSize, Pager, savePageSize } from '@/components/ui/pager'
import type { Store, StockItem } from '@/features/stock/api/stock.api'
import { storeName, wineLabel } from '@/features/stock/columns'
import { cn } from '@/lib/cn'
import type { Json, StockAction } from '@/lib/database.types'
import { fmtDate, fmtDateTime, fmtInt, fmtMoney } from '@/lib/format'
import { logsListOptions, type StockItemLog } from '../api/logs.api'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'gold' | 'brand' | 'neutral'

const ACTIONS: Record<StockAction, { label: string; tone: Tone }> = {
  create: { label: 'เพิ่มใหม่', tone: 'success' },
  update: { label: 'แก้ไข', tone: 'warning' },
  delete: { label: 'ลบ', tone: 'danger' },
  restore: { label: 'กู้คืน', tone: 'info' },
  receive: { label: 'รับเข้า', tone: 'gold' },
  withdraw: { label: 'เบิก', tone: 'brand' },
  void_receipt: { label: 'ยกเลิกรับเข้า', tone: 'neutral' },
  void_withdrawal: { label: 'ยกเลิกเบิก', tone: 'neutral' },
}

const FIELD_LABELS: Record<string, string> = {
  store_id: 'Store',
  rack: 'Wine racks',
  country: 'Country',
  wine_name: 'ชื่อไวน์',
  vintage: 'Year',
  rating_rp: 'RP',
  rating_ws: 'WS',
  maturity_from: 'ดื่มได้ตั้งแต่',
  maturity_to: 'ดื่มได้ถึง',
  price_per_bottle: 'Price/Btl.',
  supplier: 'ซื้อจากใคร',
  purchase_date: 'วันที่ซื้อ',
  remark: 'Remark',
  balance: 'คงเหลือ',
}

const FILTERS: Array<{ value: StockAction | ''; label: string }> = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'create', label: 'เพิ่มใหม่' },
  { value: 'update', label: 'แก้ไข' },
  { value: 'delete', label: 'ลบ' },
  { value: 'restore', label: 'กู้คืน' },
  { value: 'receive', label: 'รับเข้า' },
  { value: 'withdraw', label: 'เบิก' },
]

function fmtField(stores: Store[], key: string, v: Json | undefined): string {
  if (v == null || v === '') return '–'
  if (key === 'store_id') return storeName(stores, Number(v))
  if (key === 'purchase_date') return fmtDate(String(v))
  if (key === 'price_per_bottle') return fmtMoney(Number(v))
  if (key === 'balance') return fmtInt(Number(v))
  return String(v)
}

function actionOf(log: StockItemLog) {
  const a = ACTIONS[log.action]
  // รับเข้าไวน์ที่ยังไม่มี = สร้างรายการใหม่ไปด้วย
  if (log.action === 'receive' && log.changes.balance && log.changes.balance.old == null) {
    return { label: 'รับเข้า (ใหม่)', tone: 'success' as Tone }
  }
  return a
}

function LogEntry({ log, stores, showWine }: { log: StockItemLog; stores: Store[]; showWine: boolean }) {
  const a = actionOf(log)
  const isNew = log.action === 'create' || (log.action === 'receive' && log.changes.balance?.old == null)
  const entries = Object.entries(log.changes).filter(([k]) => k !== 'deleted_at')
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:gap-4">
      <div className="flex shrink-0 items-start gap-2 sm:w-52 sm:flex-col sm:gap-1">
        <Badge tone={a.tone}>{a.label}</Badge>
        <div className="text-xs text-muted">
          <div>{fmtDateTime(log.created_at)}</div>
          <div className="truncate">{log.created_by_email ?? '-'}</div>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {showWine && (
          <div className="text-sm font-medium">
            {wineLabel(log)}
            <span className="ml-2 text-xs font-normal text-muted">{storeName(stores, log.store_id)}</span>
          </div>
        )}
        {log.ref_doc && <div className="font-mono text-xs text-brand-700">{log.ref_doc}</div>}
        {entries.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entries.map(([k, ch]) => (
              <span
                key={k}
                className={cn(
                  'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
                  k === 'balance' ? 'border-brand-200 bg-brand-50' : isNew ? 'border-success-600/20 bg-success-50' : 'border-warning-600/25 bg-warning-50',
                )}
              >
                <span className="text-muted">{FIELD_LABELS[k] ?? k}:</span>
                {!isNew && (
                  <>
                    <span className="truncate text-ink-2 line-through decoration-muted/60">{fmtField(stores, k, ch.old)}</span>
                    <ArrowRight className="size-3 shrink-0 text-muted" />
                  </>
                )}
                <span className="truncate font-medium">{fmtField(stores, k, ch.new)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

/** รายการประวัติการทำรายการ แบ่งหน้าฝั่ง server */
export function LogList({
  stores,
  stockItemId,
  pageSize = 20,
}: {
  stores: Store[]
  stockItemId?: string
  pageSize?: number
}) {
  const [page, setPage] = useState(1)
  const sizeKey = stockItemId ? 'item-logs' : 'logs'
  const [size, setSize] = useState(() => loadPageSize(sizeKey, pageSize))
  const [action, setAction] = useState<StockAction | ''>('')
  const q = useQuery(logsListOptions({ page, pageSize: size, stockItemId, action: action || undefined }))
  const total = q.data?.total ?? 0

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setAction(f.value)
              setPage(1)
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition',
              action === f.value ? 'bg-brand-700 text-white' : 'bg-surface-3 text-ink-2 hover:bg-line',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {q.isLoading && <div className="p-8 text-center text-sm text-muted">กำลังโหลด…</div>}
        {!q.isLoading && !q.data?.items.length && (
          <div className="p-10 text-center text-sm text-muted">ยังไม่มีประวัติ</div>
        )}
        <ul className="divide-y divide-line">
          {q.data?.items.map((l) => <LogEntry key={l.id} log={l} stores={stores} showWine={!stockItemId} />)}
        </ul>
      </div>
      {total > 0 && (
        <Pager
          className="justify-end"
          page={page}
          pageSize={size}
          total={total}
          options={DOC_PAGE_SIZES}
          onPage={setPage}
          onPageSize={(n) => {
            setSize(n)
            savePageSize(sizeKey, n)
            setPage(1)
          }}
        />
      )}
    </div>
  )
}

/** ประวัติของไวน์รายการเดียว (เปิดจากหน้าสต็อก) */
export function ItemHistoryDialog({
  item,
  stores,
  onClose,
}: {
  item: StockItem | null
  stores: Store[]
  onClose: () => void
}) {
  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      size="lg"
      title={item ? `ประวัติ · ${wineLabel(item)}` : ''}
      description={item ? `${storeName(stores, item.store_id)} · Rack ${item.rack ?? '-'} · คงเหลือ ${item.balance} ขวด` : undefined}
    >
      {item && <LogList key={item.id} stores={stores} stockItemId={item.id} pageSize={10} />}
    </Dialog>
  )
}
