import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, ClipboardCheck, GlassWater, QrCode as QrIcon, ShoppingBag, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { QrCode, itemUrl } from '@/components/ui/qr-code'
import { LogList } from '@/features/history/components/LogList'
import { useAppSettings } from '@/features/settings/api/settings.api'
import { fmtDate, fmtInt, fmtMoney } from '@/lib/format'
import { stockItemsOptions, storesOptions } from '../api/stock.api'
import { MaturityBadge, storeName } from '../columns'

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium">{children || '–'}</dd>
    </div>
  )
}

/** หน้าไวน์ 1 รายการ — ปลายทางของ QR บนป้ายห้อยขวด (ออกแบบให้ใช้บนมือถือเป็นหลัก) */
export function ItemPage({ id }: { id: string }) {
  const itemsQ = useQuery(stockItemsOptions())
  const stores = useQuery(storesOptions()).data ?? []
  const { low_stock_threshold: lowAt } = useAppSettings()
  const it = itemsQ.data?.find((i) => i.id === id)

  if (itemsQ.isLoading) return <div className="p-10 text-center text-sm text-muted">กำลังโหลด…</div>
  if (!it) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-surface p-8 text-center">
        <div className="text-lg font-semibold">ไม่พบไวน์รายการนี้</div>
        <p className="mt-1 text-sm text-muted">อาจถูกลบออกจากสต็อกแล้ว หรือ QR ไม่ถูกต้อง</p>
        <Link to="/stock" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-700 underline">
          <Warehouse className="size-4" /> ไปหน้าสต็อก
        </Link>
      </div>
    )
  }

  const low = lowAt > 0 && it.balance > 0 && it.balance <= lowAt
  const actions = [
    { to: '/withdraw', label: 'เบิก', icon: GlassWater, disabled: it.balance <= 0 },
    { to: '/sale', label: 'ขาย', icon: ShoppingBag, disabled: it.balance <= 0 },
    { to: '/transfer', label: 'โอนย้าย', icon: ArrowLeftRight, disabled: it.balance <= 0 },
    { to: '/adjust', label: 'ปรับยอด', icon: ClipboardCheck, disabled: false },
    { to: '/qr', label: 'พิมพ์ป้าย', icon: QrIcon, disabled: false },
  ] as const

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex gap-4 bg-gradient-to-br from-brand-800 to-brand-900 p-5 text-white">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-brand-200">
              {it.country ?? '–'} · {storeName(stores, it.store_id)} · Rack {it.rack ?? '-'}
            </div>
            <h1 className="mt-1 font-display text-2xl leading-tight font-bold sm:text-3xl">{it.wine_name}</h1>
            <div className="mt-1 text-lg text-gold-100">{it.vintage ?? 'NV'}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-brand-200">คงเหลือ</div>
            <div className="text-4xl font-bold tabular-nums">{fmtInt(it.balance)}</div>
            <div className="text-xs text-brand-200">ขวด</div>
            {low && <Badge tone="warning" className="mt-1">ใกล้หมด</Badge>}
            {it.balance === 0 && <Badge className="mt-1">หมด</Badge>}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 border-b border-line p-2">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              search={{ items: it.id }}
              disabled={a.disabled}
              className="flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-xs font-medium text-ink-2 transition hover:bg-brand-50 hover:text-brand-800 aria-disabled:pointer-events-none aria-disabled:opacity-35"
            >
              <a.icon className="size-5" />
              {a.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Info label="RP / WS">
              {it.rating_rp ?? '–'} / {it.rating_ws ?? '–'}
            </Info>
            <Info label="Maturity">
              <MaturityBadge from={it.maturity_from} to={it.maturity_to} />
            </Info>
            <Info label="Price/Btl.">{it.price_per_bottle != null ? `${fmtMoney(it.price_per_bottle)} บาท` : null}</Info>
            <Info label="ซื้อจากใคร">{it.supplier}</Info>
            <Info label="วันที่ซื้อ">{fmtDate(it.purchase_date)}</Info>
            <Info label="มูลค่าคงเหลือ">
              {it.price_per_bottle != null ? `${fmtMoney(it.balance * it.price_per_bottle)} บาท` : null}
            </Info>
            {it.remark && (
              <div className="col-span-full">
                <dt className="text-xs text-muted">Remark</dt>
                <dd className="text-sm">{it.remark}</dd>
              </div>
            )}
          </dl>
          <div className="flex shrink-0 flex-col items-center gap-1 self-center">
            <QrCode value={itemUrl(it.id)} className="size-28" title={`QR ของ ${it.wine_name}`} />
            <span className="font-mono text-[10px] text-muted">{it.id.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">ประวัติของไวน์รายการนี้</h2>
        <LogList stores={stores} stockItemId={it.id} pageSize={10} />
      </section>
    </div>
  )
}
