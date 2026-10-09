import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Minus, Plus, Printer, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { matchesWords } from '@/components/data-grid/utils'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page'
import { QrCode, itemUrl } from '@/components/ui/qr-code'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { stockItemsOptions, storesOptions, type StockItem, type Store } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { cn } from '@/lib/cn'
import { fmtMaturity, fmtMoney } from '@/lib/format'
import { loadDraft, saveDraft } from '@/lib/use-local-draft'

/** ขนาดป้ายห้อยคอขวด (มม.) */
const SIZES = {
  s: { label: 'เล็ก 35×60', w: 35, h: 60 },
  m: { label: 'กลาง 50×80', w: 50, h: 80 },
  l: { label: 'ใหญ่ 60×100', w: 60, h: 100 },
} as const
type SizeKey = keyof typeof SIZES

// กระดาษ A4 ขอบ 8 มม.
const PAGE = { w: 210, h: 297, margin: 8 }

type Fields = { country: boolean; place: boolean; rating: boolean; maturity: boolean; price: boolean; hole: boolean }
type Options = { size: SizeKey; fields: Fields }
const OPTIONS_KEY = 'stock-wine:qr-options:v1'
const DEFAULT_OPTIONS: Options = {
  size: 'm',
  fields: { country: true, place: true, rating: true, maturity: true, price: false, hole: true },
}

function Tag({ it, stores, opt }: { it: StockItem; stores: Store[]; opt: Options }) {
  const s = SIZES[opt.size]
  const f = opt.fields
  const small = opt.size === 's'
  return (
    <div
      className="relative flex flex-col items-center overflow-hidden border border-dashed border-[#999] bg-white text-center text-black"
      style={{ width: `${s.w}mm`, height: `${s.h}mm`, padding: small ? '2mm' : '3mm' }}
    >
      {f.hole && (
        <div className="shrink-0 rounded-full border border-[#999]" style={{ width: '5mm', height: '5mm', marginBottom: '1.5mm' }} />
      )}
      <div className="w-full font-bold leading-tight" style={{ fontSize: small ? '2.6mm' : '3.4mm' }}>
        <div className="line-clamp-2">{it.wine_name}</div>
      </div>
      <div className="font-bold" style={{ fontSize: small ? '3.4mm' : '4.6mm', margin: '0.5mm 0' }}>
        {it.vintage ?? 'NV'}
      </div>
      <QrCode value={itemUrl(it.id)} margin={1} className="aspect-square w-full flex-1" />
      <div className="w-full leading-snug" style={{ fontSize: small ? '2mm' : '2.5mm', marginTop: '1mm' }}>
        {f.country && it.country && <div className="truncate">{it.country}</div>}
        {f.place && (
          <div className="truncate">
            {storeName(stores, it.store_id)} · {it.rack ?? '-'}
          </div>
        )}
        {f.rating && (it.rating_rp != null || it.rating_ws != null) && (
          <div>
            RP {it.rating_rp ?? '–'} · WS {it.rating_ws ?? '–'}
          </div>
        )}
        {f.maturity && fmtMaturity(it.maturity_from, it.maturity_to) && <div>ดื่มได้ {fmtMaturity(it.maturity_from, it.maturity_to)}</div>}
        {f.price && it.price_per_bottle != null && <div className="font-semibold">฿{fmtMoney(it.price_per_bottle)}</div>}
        <div className="font-mono" style={{ fontSize: small ? '1.6mm' : '1.9mm', color: '#666' }}>
          {it.id.slice(0, 8).toUpperCase()}
        </div>
      </div>
    </div>
  )
}

function Sheets({ tags, stores, opt }: { tags: StockItem[]; stores: Store[]; opt: Options }) {
  const s = SIZES[opt.size]
  const cols = Math.floor((PAGE.w - PAGE.margin * 2) / s.w)
  const rows = Math.floor((PAGE.h - PAGE.margin * 2) / s.h)
  const per = cols * rows
  const pages = Array.from({ length: Math.ceil(tags.length / per) }, (_, i) => tags.slice(i * per, (i + 1) * per))
  return (
    <>
      {pages.map((p, i) => (
        <div
          key={i}
          className="qr-sheet bg-white"
          style={{ width: `${PAGE.w}mm`, height: `${PAGE.h}mm`, padding: `${PAGE.margin}mm` } as CSSProperties}
        >
          <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${s.w}mm)`, gridAutoRows: `${s.h}mm` }}>
            {p.map((it, j) => (
              <Tag key={`${it.id}-${j}`} it={it} stores={stores} opt={opt} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export function QrPage({ prefillIds }: { prefillIds: string[] }) {
  const navigate = useNavigate()
  const itemsQ = useQuery(stockItemsOptions())
  const stores = useQuery(storesOptions()).data ?? []
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const [opt, setOpt] = useState<Options>(() => ({ ...DEFAULT_OPTIONS, ...loadDraft<Options>(OPTIONS_KEY) }))
  useEffect(() => saveDraft(OPTIONS_KEY, opt), [opt])
  const [copies, setCopies] = useState<Record<string, number>>({})
  const [scope, setScope] = useState(0)
  const [q, setQ] = useState('')
  const [onlyInStock, setOnlyInStock] = useState(true)

  // มาจากหน้าสต็อก/หน้าไวน์: เลือกไว้ให้ จำนวนป้าย = จำนวนขวด
  useEffect(() => {
    if (!prefillIds.length || !items.length) return
    setCopies((c) => {
      const next = { ...c }
      for (const id of prefillIds) next[id] = Math.max(1, byId.get(id)?.balance ?? 1)
      return next
    })
    navigate({ to: '/qr', search: {}, replace: true })
  }, [prefillIds, items.length, byId, navigate])

  const visible = useMemo(
    () =>
      items
        .filter((i) => (!scope || i.store_id === scope) && (!onlyInStock || i.balance > 0))
        .filter((i) => !q.trim() || matchesWords(`${i.wine_name} ${i.vintage ?? 'nv'} ${i.country ?? ''} ${i.rack ?? ''}`, q))
        .sort((a, b) => a.store_id - b.store_id || (a.rack ?? '').localeCompare(b.rack ?? '', 'th', { numeric: true }) || a.wine_name.localeCompare(b.wine_name)),
    [items, scope, q, onlyInStock],
  )

  const tags = useMemo(
    () => Object.entries(copies).flatMap(([id, n]) => (byId.get(id) ? Array.from({ length: n }, () => byId.get(id)!) : [])),
    [copies, byId],
  )
  const s = SIZES[opt.size]
  const perPage = Math.floor((PAGE.w - PAGE.margin * 2) / s.w) * Math.floor((PAGE.h - PAGE.margin * 2) / s.h)
  const pageCount = Math.ceil(tags.length / perPage)
  const allVisibleSelected = visible.length > 0 && visible.every((i) => copies[i.id])

  const setCount = (id: string, n: number) =>
    setCopies((c) => {
      const next = { ...c }
      if (n > 0) next[id] = Math.min(999, n)
      else delete next[id]
      return next
    })

  function toggleAllVisible() {
    setCopies((c) => {
      const next = { ...c }
      for (const i of visible) {
        if (allVisibleSelected) delete next[i.id]
        else next[i.id] ??= Math.max(1, i.balance)
      }
      return next
    })
  }

  function print() {
    if (!tags.length) return toast.info('ยังไม่ได้เลือกไวน์')
    window.print()
  }

  const field = (k: keyof Fields, label: string) => (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      {label}
      <Switch checked={opt.fields[k]} label={label} onChange={(v) => setOpt((o) => ({ ...o, fields: { ...o.fields, [k]: v } }))} />
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ป้าย QR ห้อยขวด"
        description="เลือกไวน์และจำนวนป้าย แล้วพิมพ์บนกระดาษ A4 ตัดตามเส้นประ · สแกนแล้วเปิดหน้าไวน์ในระบบ (ต้อง login)"
        actions={
          <Button variant="primary" onClick={print} disabled={!tags.length}>
            <Printer className="size-4" /> พิมพ์ {tags.length} ป้าย ({pageCount} แผ่น)
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(360px,440px)_1fr]">
        {/* เลือกไวน์ */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <div className="flex gap-2">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาไวน์…" className="pl-9" />
              </label>
              <Combobox
                className="w-44"
                value={scope}
                onChange={setScope}
                options={[{ value: 0, label: 'ทุกคลัง' }, ...stores.filter((st) => st.is_active).map((st) => ({ value: st.id, label: st.name }))]}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="size-4 accent-brand-700" checked={allVisibleSelected} onChange={toggleAllVisible} />
                เลือกทั้งหมด ({visible.length})
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-ink-2">
                <input type="checkbox" className="size-4 accent-brand-700" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} />
                เฉพาะที่มีของ
              </label>
            </div>
          </div>
          <ul className="max-h-[60dvh] min-h-[240px] divide-y divide-line overflow-auto">
            {visible.map((i) => {
              const n = copies[i.id] ?? 0
              return (
                <li key={i.id} className={cn('flex items-center gap-3 px-3 py-2', n > 0 && 'bg-brand-50/60')}>
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-brand-700"
                    checked={n > 0}
                    onChange={(e) => setCount(i.id, e.target.checked ? Math.max(1, i.balance) : 0)}
                    aria-label={`เลือก ${i.wine_name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {i.wine_name} {i.vintage ?? 'NV'}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {storeName(stores, i.store_id)} · {i.rack ?? '-'} · คงเหลือ {i.balance}
                    </div>
                  </div>
                  <div className={cn('flex items-center rounded-lg border border-line-strong', !n && 'opacity-40')}>
                    <button type="button" className="p-1.5 hover:bg-surface-3" aria-label="ลดจำนวนป้าย" onClick={() => setCount(i.id, n - 1)}>
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      value={n}
                      inputMode="numeric"
                      aria-label="จำนวนป้าย"
                      onChange={(e) => setCount(i.id, Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                      className="w-9 bg-transparent text-center text-sm tabular-nums outline-none"
                    />
                    <button type="button" className="p-1.5 hover:bg-surface-3" aria-label="เพิ่มจำนวนป้าย" onClick={() => setCount(i.id, n + 1)}>
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
            {!visible.length && <li className="p-8 text-center text-sm text-muted">ไม่พบไวน์</li>}
          </ul>
        </section>

        {/* รูปแบบ + ตัวอย่าง */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 rounded-xl border border-line bg-surface p-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-2">ขนาดป้าย (มม.)</span>
              <Segmented
                className="!mx-0 !px-0"
                value={opt.size}
                onChange={(v) => setOpt((o) => ({ ...o, size: v }))}
                items={(Object.keys(SIZES) as SizeKey[]).map((k) => ({ value: k, label: SIZES[k].label }))}
              />
              <span className="text-xs text-muted">A4 ได้ {perPage} ป้ายต่อแผ่น</span>
            </div>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {field('country', 'ประเทศ')}
              {field('place', 'คลัง · Rack')}
              {field('rating', 'คะแนน RP/WS')}
              {field('maturity', 'ช่วงดื่ม')}
              {field('price', 'ราคา')}
              {field('hole', 'วงเจาะรูห้อย')}
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-line bg-surface-3 p-4">
            {tags.length ? (
              <div className="flex origin-top-left flex-col items-center gap-4 [&_.qr-sheet]:shadow-lg">
                <Sheets tags={tags} stores={stores} opt={opt} />
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted">เลือกไวน์ทางซ้ายเพื่อดูตัวอย่างป้าย</div>
            )}
          </div>
        </section>
      </div>

      {/* ส่วนที่พิมพ์จริง (แสดงเฉพาะตอนสั่งพิมพ์) */}
      {tags.length > 0 &&
        createPortal(
          <div className="print-root">
            <Sheets tags={tags} stores={stores} opt={opt} />
          </div>,
          document.body,
        )}
    </div>
  )
}
