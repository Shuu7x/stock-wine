import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  GlassWater,
  Hourglass,
  PackagePlus,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Loading, Skeleton } from '@/components/ui/loading'
import { PageHeader } from '@/components/ui/page'
import { Segmented } from '@/components/ui/segmented'
import { unbilledSalesOptions } from '@/features/billing/api/billing.api'
import { logsListOptions } from '@/features/history/api/logs.api'
import { ACTIONS } from '@/features/history/components/LogList'
import { useAppSettings } from '@/features/settings/api/settings.api'
import { stockItemsOptions, storesOptions } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { cn } from '@/lib/cn'
import { fmtDate, fmtDateTime, fmtInt, fmtMoney } from '@/lib/format'
import { activityOptions, buckets, PERIOD_LABEL, periodRanges, type Activity, type Period, type Range } from '../api/dashboard.api'
import { BarChart, BarList, StackBar } from './charts'

const COUNTRY_COLORS = ['var(--color-brand-800)', 'var(--color-brand-600)', 'var(--color-gold-500)', 'var(--color-brand-400)', 'var(--color-brand-200)', '#cfc4bb']

/** ยอดรวมของช่วงหนึ่ง */
function summarize(a: Activity | undefined, r: Range) {
  const inR = (d: string) => d >= r.from && d <= r.to
  const sales = (a?.sales ?? []).filter((s) => inR(s.sold_at))
  let revenue = 0
  let bottles = 0
  let profit = 0
  let costedNet = 0
  for (const s of sales) {
    revenue += s.total
    for (const l of s.sale_lines) {
      bottles += l.qty
      if (l.cost_per_bottle != null) {
        profit += l.amount_before_vat - l.cost_per_bottle * l.qty
        costedNet += l.amount_before_vat
      }
    }
  }
  const withdrawn = (a?.withdrawalLines ?? []).filter((l) => inR(l.withdraw_date)).reduce((n, l) => n + l.qty, 0)
  const receiptLines = (a?.receipts ?? []).filter((x) => inR(x.received_at)).flatMap((x) => x.receipt_lines)
  return {
    sales,
    revenue,
    count: sales.length,
    bottles,
    profit,
    margin: costedNet > 0 ? profit / costedNet : null,
    withdrawn,
    received: receiptLines.reduce((n, l) => n + l.qty, 0),
    receivedValue: receiptLines.reduce((n, l) => n + l.qty * (l.price_per_bottle ?? 0), 0),
  }
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev && !cur) return null
  if (!prev) return <Badge tone="success">ใหม่</Badge>
  const pct = ((cur - prev) / prev) * 100
  const up = pct >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', up ? 'text-success-700' : 'text-danger-700')}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(pct) >= 999 ? '999+' : Math.abs(pct).toFixed(0)}%
    </span>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  delta,
  to,
  search,
  loading,
}: {
  icon: LucideIcon
  label: string
  loading?: boolean
  value: string
  unit?: string
  hint?: ReactNode
  delta?: ReactNode
  to?: string
  search?: Record<string, string>
}) {
  const figure = loading ? (
    <>
      <Skeleton className="mt-3 h-6 w-3/4 sm:mt-4 sm:h-7" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </>
  ) : (
    <>
      <div className="mt-2 flex items-baseline gap-1.5 sm:mt-3">
        <span className="truncate text-lg font-bold text-ink tabular-nums sm:text-2xl">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 line-clamp-2 text-xs text-muted sm:truncate">{hint}</div>}
    </>
  )
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
          <span className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 sm:flex">
            <Icon className="size-4" />
          </span>
          {label}
        </span>
        {!loading && delta}
      </div>
      {figure}
    </>
  )
  const cls = 'block min-w-0 rounded-xl border border-line bg-surface p-3 transition sm:p-4'
  return to ? (
    <Link to={to} search={search} className={cn(cls, 'hover:border-brand-200 hover:shadow-sm')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function Panel({
  title,
  action,
  children,
  className,
  loading,
  skeleton = <SkeletonRows />,
}: {
  title: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  /** ระหว่างโหลดแสดง skeleton แทนเนื้อหา */
  loading?: boolean
  skeleton?: ReactNode
}) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {loading ? skeleton : children}
    </section>
  )
}

function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <div className="flex justify-between gap-4">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3.5 w-12" />
          </div>
          <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

const MoreLink = ({ to, search, children }: { to: string; search?: Record<string, string>; children: ReactNode }) => (
  <Link to={to} search={search} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
    {children} <ArrowRight className="size-3.5" />
  </Link>
)

export function DashboardPage({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const { cur, prev } = useMemo(() => periodRanges(period), [period])
  const settings = useAppSettings()
  const stores = useQuery(storesOptions()).data ?? []
  const itemsQ = useQuery(stockItemsOptions())
  const activityQ = useQuery(activityOptions(prev.from, cur.to))
  const unbilled = useQuery(unbilledSalesOptions()).data ?? []
  const logsQ = useQuery(logsListOptions({ page: 1, pageSize: 8 }))
  const logs = logsQ.data?.items ?? []

  const now = useMemo(() => summarize(activityQ.data, cur), [activityQ.data, cur])
  const before = useMemo(() => summarize(activityQ.data, prev), [activityQ.data, prev])

  const stock = useMemo(() => {
    const items = (itemsQ.data ?? []).filter((i) => !i.deleted_at)
    const year = new Date().getFullYear()
    const inStock = items.filter((i) => i.balance > 0)
    const byStore = new Map<number, { bottles: number; value: number; items: number }>()
    const byCountry = new Map<string, number>()
    let bottles = 0
    let value = 0
    for (const i of inStock) {
      const v = i.balance * (i.price_per_bottle ?? 0)
      bottles += i.balance
      value += v
      const s = byStore.get(i.store_id) ?? { bottles: 0, value: 0, items: 0 }
      s.bottles += i.balance
      s.value += v
      s.items++
      byStore.set(i.store_id, s)
      const c = i.country?.trim() || 'ไม่ระบุ'
      byCountry.set(c, (byCountry.get(c) ?? 0) + i.balance)
    }
    const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1])
    const top = countries.slice(0, 5)
    const rest = countries.slice(5).reduce((n, [, v]) => n + v, 0)
    return {
      bottles,
      value,
      items: inStock.length,
      out: items.filter((i) => i.balance <= 0).length,
      low: inStock.filter((i) => i.balance <= settings.low_stock_threshold).sort((a, b) => a.balance - b.balance),
      drinkSoon: inStock
        .filter((i) => i.maturity_to != null && i.maturity_to <= year)
        .sort((a, b) => (a.maturity_to ?? 0) - (b.maturity_to ?? 0)),
      byStore,
      countries: [...top, ...(rest ? [['อื่นๆ', rest] as [string, number]] : [])],
    }
  }, [itemsQ.data, settings.low_stock_threshold])

  const chart = useMemo(
    () =>
      buckets(period, cur).map((b) => {
        const ss = now.sales.filter((s) => s.sold_at >= b.from && s.sold_at <= b.to)
        const total = ss.reduce((n, s) => n + s.total, 0)
        const qty = ss.reduce((n, s) => n + s.sale_lines.reduce((m, l) => m + l.qty, 0), 0)
        return {
          key: b.key,
          label: b.label,
          value: total,
          tip: (
            <>
              <div className="font-semibold">{period === 'year' ? b.label : fmtDate(b.from)}</div>
              <div>
                ฿{fmtMoney(total)} · {fmtInt(qty)} ขวด · {ss.length} ใบ
              </div>
            </>
          ),
        }
      }),
    [now.sales, period, cur],
  )

  const topWines = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number; store: number }>()
    for (const s of now.sales)
      for (const l of s.sale_lines) {
        const k = l.stock_item_id
        const e = m.get(k) ?? { name: `${l.wine_name} ${l.vintage ?? 'NV'}`, qty: 0, revenue: 0, store: l.store_id }
        e.qty += l.qty
        e.revenue += l.line_total
        m.set(k, e)
      }
    return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty || b[1].revenue - a[1].revenue).slice(0, 5)
  }, [now.sales])

  const unbilledTotal = unbilled.reduce((n, s) => n + s.total, 0)
  const loading = activityQ.isPending || itemsQ.isPending
  const rangeText = cur.from === cur.to ? fmtDate(cur.from) : `${fmtDate(cur.from)} – ${fmtDate(cur.to)}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ภาพรวม"
        description={`${rangeText} · เทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน`}
        actions={
          <Segmented
            className="!mx-0 !px-0"
            value={period}
            onChange={onPeriod}
            items={(Object.keys(PERIOD_LABEL) as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
          />
        }
      />

      {/* ตัวเลขหลัก */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          loading={loading}
          icon={ShoppingBag}
          label="ยอดขาย"
          value={`฿${fmtMoney(now.revenue)}`}
          hint={`${fmtInt(now.count)} ใบขาย · รวม VAT`}
          delta={<Delta cur={now.revenue} prev={before.revenue} />}
          to="/history"
          search={{ tab: 'sales' }}
        />
        <Kpi
          loading={loading}
          icon={TrendingUp}
          label="กำไรขั้นต้น"
          value={`฿${fmtMoney(Math.round(now.profit))}`}
          hint={now.margin != null ? `อัตรากำไร ${(now.margin * 100).toFixed(1)}% (ก่อน VAT เทียบราคาทุน)` : 'ยังไม่มีข้อมูลต้นทุน'}
          delta={<Delta cur={now.profit} prev={before.profit} />}
        />
        <Kpi
          loading={loading}
          icon={GlassWater}
          label="ขวดที่ออก"
          value={fmtInt(now.bottles + now.withdrawn)}
          unit="ขวด"
          hint={`ขาย ${fmtInt(now.bottles)} · เบิก ${fmtInt(now.withdrawn)} · รับเข้า ${fmtInt(now.received)}`}
          delta={<Delta cur={now.bottles + now.withdrawn} prev={before.bottles + before.withdrawn} />}
        />
        <Kpi
          loading={loading}
          icon={Warehouse}
          label="มูลค่าสต็อก"
          value={`฿${fmtMoney(stock.value)}`}
          hint={`${fmtInt(stock.bottles)} ขวด · ${fmtInt(stock.items)} รายการ · ณ วันนี้`}
          to="/stock"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title={`ยอดขาย${period === 'year' ? 'รายเดือน' : 'รายวัน'}`}
          action={<span className="text-xs text-muted">ชี้ที่แท่งเพื่อดูรายละเอียด</span>}
          loading={loading}
          skeleton={<Loading className="min-h-[240px]" label="กำลังรวมยอดขาย…" />}
        >
          <BarChart data={chart} height={240} />
        </Panel>

        {/* สิ่งที่ต้องดูแล */}
        <Panel title="ต้องดูแล" loading={loading} skeleton={<SkeletonRows n={4} />}>
          <ul className="flex flex-col divide-y divide-line">
            <Attention
              icon={Receipt}
              tone="gold"
              title="รอออกบิล"
              value={`${fmtInt(unbilled.length)} ใบขาย`}
              sub={unbilled.length ? `ยอด ฿${fmtMoney(unbilledTotal)}` : 'ออกบิลครบแล้ว'}
              to="/billing"
            />
            <Attention
              icon={AlertTriangle}
              tone="warning"
              title={`ใกล้หมด (≤ ${settings.low_stock_threshold} ขวด)`}
              value={`${fmtInt(stock.low.length)} รายการ`}
              sub={stock.low.length ? stock.low.slice(0, 2).map((i) => `${i.wine_name} (${i.balance})`).join(' · ') : `หมดแล้ว ${fmtInt(stock.out)} รายการ`}
              to="/stock"
            />
            <Attention
              icon={Hourglass}
              tone="danger"
              title="ช่วงดื่มสิ้นสุดปีนี้/เลยแล้ว"
              value={`${fmtInt(stock.drinkSoon.length)} รายการ`}
              sub={stock.drinkSoon.length ? `ควรขายก่อน: ${stock.drinkSoon.slice(0, 2).map((i) => i.wine_name).join(' · ')}` : 'ไม่มี'}
              to="/stock"
            />
            <Attention
              icon={PackagePlus}
              tone="success"
              title={`รับเข้า ${PERIOD_LABEL[period]}`}
              value={`${fmtInt(now.received)} ขวด`}
              sub={now.receivedValue ? `มูลค่า ฿${fmtMoney(now.receivedValue)}` : 'ไม่มีการรับเข้า'}
              to="/history"
              search={{ tab: 'receipts' }}
            />
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="ขายดี" loading={loading} action={<span className="text-xs text-muted">{PERIOD_LABEL[period]} · ตามจำนวนขวด</span>}>
          <BarList
            empty="ยังไม่มีการขายในช่วงนี้"
            rows={topWines.map(([id, w], i) => ({
              key: id,
              label: (
                <Link to="/item/$id" params={{ id }} className="hover:text-brand-700 hover:underline">
                  <span className="mr-1.5 text-muted tabular-nums">{i + 1}.</span>
                  {w.name}
                </Link>
              ),
              value: w.qty,
              display: `${fmtInt(w.qty)} ขวด`,
              sub: `฿${fmtMoney(w.revenue)} · ${storeName(stores, w.store)}`,
            }))}
          />
        </Panel>

        <Panel title="สต็อกตามคลัง" loading={loading} action={<MoreLink to="/stock">ดูสต็อก</MoreLink>}>
          <BarList
            rows={stores
              .filter((s) => s.is_active)
              .map((s) => {
                const v = stock.byStore.get(s.id) ?? { bottles: 0, value: 0, items: 0 }
                return {
                  key: String(s.id),
                  label: (
                    <Link to="/stock" search={{ store: s.code }} className="hover:text-brand-700 hover:underline">
                      {s.name}
                    </Link>
                  ),
                  value: v.bottles,
                  display: `${fmtInt(v.bottles)} ขวด`,
                  sub: `${fmtInt(v.items)} รายการ · ฿${fmtMoney(v.value)}`,
                  tone: 'bg-gold-500',
                }
              })}
          />
        </Panel>

        <Panel title="ขวดในสต็อกตามประเทศ" className="lg:col-span-2 xl:col-span-1" loading={loading} skeleton={<SkeletonRows n={2} />}>
          <StackBar parts={stock.countries.map(([label, value], i) => ({ key: label, label, value, color: COUNTRY_COLORS[i % COUNTRY_COLORS.length] }))} />
        </Panel>
      </div>

      <Panel title="ความเคลื่อนไหวล่าสุด" loading={logsQ.isPending} skeleton={<SkeletonRows n={4} />} action={<MoreLink to="/history" search={{ tab: 'logs' }}>ดูทั้งหมด</MoreLink>}>
        {logs.length ? (
          <ul className="grid grid-cols-1 gap-x-6 divide-y divide-line md:grid-cols-2 md:divide-y-0">
            {logs.map((l) => {
              const a = ACTIONS[l.action]
              const bal = l.changes.balance as { old?: number; new?: number } | undefined
              const diff = bal && typeof bal.old === 'number' && typeof bal.new === 'number' ? bal.new - bal.old : null
              return (
                <li key={l.id} className="flex items-center gap-3 py-2.5 md:border-b md:border-line">
                  <Badge tone={a.tone} className="w-[72px] justify-center">
                    {a.label}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <Link to="/item/$id" params={{ id: l.stock_item_id }} className="block truncate text-sm hover:text-brand-700 hover:underline">
                      {l.wine_name} {l.vintage ?? 'NV'}
                    </Link>
                    <div className="flex items-center gap-1 truncate text-xs text-muted">
                      <Clock className="size-3" /> {fmtDateTime(l.created_at)} · {storeName(stores, l.store_id)}
                      {l.ref_doc ? ` · ${l.ref_doc}` : ''}
                    </div>
                  </div>
                  {diff != null && diff !== 0 && (
                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', diff > 0 ? 'text-success-700' : 'text-danger-700')}>
                      {diff > 0 ? '+' : ''}
                      {fmtInt(diff)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-8 text-center text-sm text-muted">ยังไม่มีความเคลื่อนไหว</div>
        )}
      </Panel>
    </div>
  )
}

const TONES = {
  gold: 'bg-gold-100 text-gold-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  success: 'bg-success-50 text-success-700',
} as const

function Attention({
  icon: Icon,
  tone,
  title,
  value,
  sub,
  to,
  search,
}: {
  icon: LucideIcon
  tone: keyof typeof TONES
  title: string
  value: string
  sub: string
  to: string
  search?: Record<string, string>
}) {
  return (
    <li>
      <Link to={to} search={search} className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-2">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm text-ink-2">{title}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
          </div>
          <div className="truncate text-xs text-muted">{sub}</div>
        </div>
        <ArrowRight className="size-4 shrink-0 text-line-strong transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </Link>
    </li>
  )
}

