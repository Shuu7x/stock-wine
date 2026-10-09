import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Minus, Plus, Printer, QrCode as QrIcon, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
/** color = หัวป้ายสีไวน์ · mono = ขาวดำ ประหยัดหมึก */
type TagStyle = 'color' | 'mono'
type Options = { size: SizeKey; style: TagStyle; fields: Fields }
const OPTIONS_KEY = 'stock-wine:qr-options:v1'
const DEFAULT_OPTIONS: Options = {
  size: 'm',
  style: 'color',
  fields: { country: true, place: true, rating: true, maturity: true, price: false, hole: true },
}

/** ขอบล่างของหัวป้ายเป็นคลื่นไวน์ */
function WaveEdge({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="block w-full" style={{ height: '2.2mm' }} aria-hidden>
      <path d="M0 0H100V3C88 8 75 8 62 4.5S38 0 25 3.5 8 8 0 4Z" fill={color} />
    </svg>
  )
}

function Tag({ it, stores, opt }: { it: StockItem; stores: Store[]; opt: Options }) {
  const s = SIZES[opt.size]
  const f = opt.fields
  const mono = opt.style === 'mono'
  // หน่วยขนาดตามความกว้างป้าย: ป้ายกลาง (50 มม.) = 1
  const u = s.w / 50
  const mm = (n: number) => `${(n * u).toFixed(2)}mm`
  const maturity = fmtMaturity(it.maturity_from, it.maturity_to)
  const hasRating = it.rating_rp != null || it.rating_ws != null

  const ink = mono ? '#111' : 'var(--color-brand-900)'
  const gold = mono ? '#111' : 'var(--color-gold-500)'
  const headBg = mono ? '#fff' : 'linear-gradient(160deg, var(--color-brand-700), var(--color-brand-900) 70%)'
  const headText = mono ? '#111' : '#fff'

  return (
    // กรอบเส้นประ = แนวตัด
    <div className="relative overflow-hidden bg-white" style={{ width: `${s.w}mm`, height: `${s.h}mm` }}>
      <div className="flex h-full flex-col" style={{ fontFamily: 'var(--font-sans)', color: ink }}>
        {/* หัวป้าย */}
        <div className="shrink-0">
          <div
            className="flex flex-col items-center text-center"
            style={{
              background: headBg,
              color: headText,
              // ขอบบนอย่างน้อย 2.2 มม. ให้วงเจาะรูไม่ชิดแนวตัดบนป้ายเล็ก
              padding: `${Math.max(2.4 * u, 2.2).toFixed(2)}mm ${mm(2.4)} ${mm(1.4)}`,
              borderBottom: mono ? '0.35mm solid #111' : undefined,
            }}
          >
            {f.hole && (
              <div
                className="shrink-0 rounded-full bg-white"
                style={{
                  width: mm(4.6),
                  height: mm(4.6),
                  marginBottom: mm(1.2),
                  boxShadow: mono ? 'inset 0 0 0 0.3mm #111' : `0 0 0 0.45mm var(--color-gold-500)`,
                }}
              />
            )}
            <div
              className="font-semibold tracking-[0.25em] uppercase"
              style={{ fontSize: mm(1.5), color: mono ? '#555' : 'var(--color-gold-100)', marginBottom: mm(0.6) }}
            >
              Wine Cellar
            </div>
            <div
              className="line-clamp-2 w-full leading-[1.12] font-bold"
              style={{ fontFamily: 'var(--font-display)', fontSize: mm(3.5) }}
            >
              {it.wine_name}
            </div>
            <div
              className="font-bold"
              style={{ fontFamily: 'var(--font-display)', fontSize: mm(5), lineHeight: 1.1, color: mono ? '#111' : 'var(--color-gold-500)' }}
            >
              {it.vintage ?? 'NV'}
            </div>
          </div>
          {!mono && <WaveEdge color="var(--color-brand-900)" />}
        </div>

        {/* QR */}
        <div className="flex min-h-0 flex-1 items-center justify-center" style={{ padding: `${mm(1.2)} ${mm(3)}` }}>
          <div
            className="aspect-square h-full max-w-full bg-white"
            style={{ padding: mm(1), border: `0.3mm solid ${gold}`, borderRadius: mm(1.4) }}
          >
            <QrCode value={itemUrl(it.id)} margin={0} className="block size-full" />
          </div>
        </div>

        {/* ข้อมูล */}
        <div className="shrink-0 text-center leading-[1.35]" style={{ fontSize: mm(2.1), padding: `0 ${mm(2.4)}` }}>
          {(f.country && it.country) || f.place ? (
            <div className="truncate font-medium">
              {[f.country && it.country, f.place && `${storeName(stores, it.store_id)} · ${it.rack ?? '-'}`].filter(Boolean).join('  |  ')}
            </div>
          ) : null}
          {(f.rating && hasRating) || (f.maturity && maturity) ? (
            <div className="flex items-center justify-center" style={{ gap: mm(1.2), marginTop: mm(0.6) }}>
              {f.rating && hasRating && (
                <span
                  className="rounded-full font-semibold whitespace-nowrap"
                  style={{
                    padding: `0 ${mm(1.2)}`,
                    background: mono ? 'transparent' : 'var(--color-gold-100)',
                    border: mono ? '0.2mm solid #111' : undefined,
                    color: mono ? '#111' : 'var(--color-gold-700)',
                  }}
                >
                  RP {it.rating_rp ?? '–'} · WS {it.rating_ws ?? '–'}
                </span>
              )}
              {f.maturity && maturity && <span className="whitespace-nowrap">ดื่ม {maturity}</span>}
            </div>
          ) : null}
        </div>

        {/* ท้ายป้าย */}
        <div
          className="flex shrink-0 items-center justify-between"
          style={{
            margin: `${mm(1)} ${mm(2.4)} ${mm(1.8)}`,
            paddingTop: mm(0.8),
            borderTop: `0.2mm dotted ${mono ? '#999' : 'var(--color-brand-200)'}`,
          }}
        >
          <span className="font-mono" style={{ fontSize: mm(1.6), color: mono ? '#555' : 'var(--color-muted)' }}>
            {it.id.slice(0, 8).toUpperCase()}
          </span>
          {f.price && it.price_per_bottle != null && (
            <span className="font-bold" style={{ fontSize: mm(2.3), color: ink }}>
              ฿{fmtMoney(it.price_per_bottle)}
            </span>
          )}
        </div>
      </div>
      {/* แนวตัด (วาดทับขอบ) */}
      <div className="pointer-events-none absolute inset-0 border border-dashed border-[#b5b5b5]" />
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

  const [opt, setOpt] = useState<Options>(() => {
    const saved = loadDraft<Partial<Options>>(OPTIONS_KEY)
    return { ...DEFAULT_OPTIONS, ...saved, fields: { ...DEFAULT_OPTIONS.fields, ...saved?.fields } }
  })
  useEffect(() => saveDraft(OPTIONS_KEY, opt), [opt])
  const [copies, setCopies] = useState<Record<string, number>>({})
  const [scope, setScope] = useState(0)
  const [q, setQ] = useState('')
  const [onlyInStock, setOnlyInStock] = useState(true)
  const [view, setView] = useState<'pick' | 'preview'>('pick')

  // ย่อตัวอย่าง A4 ให้พอดีความกว้างกล่อง
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  useLayoutEffect(() => {
    const el = previewRef.current
    if (!el) return
    const sheetPx = (PAGE.w * 96) / 25.4
    const update = () => setPreviewZoom(Math.min(1, Math.max(0.3, (el.clientWidth - 32) / sheetPx)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

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

  const selectedCount = Object.keys(copies).length

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="ป้าย QR ห้อยขวด"
        description="เลือกไวน์และจำนวนป้าย แล้วพิมพ์บนกระดาษ A4 ตัดตามเส้นประ · สแกนแล้วเปิดหน้าไวน์ในระบบ"
        actions={
          <Button variant="primary" onClick={print} disabled={!tags.length}>
            <Printer className="size-4" /> พิมพ์ {tags.length} ป้าย ({pageCount} แผ่น)
          </Button>
        }
      />

      {/* จอเล็ก: สลับระหว่างเลือกไวน์กับตัวอย่าง ให้แต่ละมุมมองได้ความสูงเต็มจอ */}
      <Segmented
        className="xl:hidden"
        value={view}
        onChange={setView}
        items={[
          { value: 'pick', label: 'เลือกไวน์', count: String(selectedCount) },
          { value: 'preview', label: 'ตัวอย่างป้าย', count: String(tags.length) },
        ]}
      />

      <div className="grid min-h-[420px] flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(340px,420px)_1fr]">
        {/* ── เลือกไวน์ ── */}
        <section
          className={cn(
            'flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface',
            view !== 'pick' && 'max-xl:hidden',
          )}
        >
          <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาไวน์…" className="pl-9" />
              </label>
              <Combobox
                className="w-40 shrink-0"
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

          <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto">
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
                  <div className={cn('flex shrink-0 items-center rounded-lg border border-line-strong', !n && 'opacity-40')}>
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

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="text-ink-2">
              เลือก <b className="tabular-nums">{selectedCount}</b> รายการ · <b className="tabular-nums">{tags.length}</b> ป้าย
            </span>
            <div className="flex gap-1">
              {selectedCount > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setCopies({})}>
                  ล้าง
                </Button>
              )}
              <Button size="sm" className="xl:hidden" onClick={() => setView('preview')} disabled={!tags.length}>
                ดูตัวอย่าง
              </Button>
            </div>
          </div>
        </section>

        {/* ── รูปแบบ + ตัวอย่าง ── */}
        <section
          className={cn(
            'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface',
            view !== 'preview' && 'max-xl:hidden',
          )}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line p-3">
            <Segmented
              className="!mx-0 !px-0"
              value={opt.size}
              onChange={(v) => setOpt((o) => ({ ...o, size: v }))}
              items={(Object.keys(SIZES) as SizeKey[]).map((k) => ({ value: k, label: SIZES[k].label }))}
            />
            <Segmented
              className="!mx-0 !px-0"
              value={opt.style}
              onChange={(v) => setOpt((o) => ({ ...o, style: v }))}
              items={[
                { value: 'color', label: 'สีไวน์' },
                { value: 'mono', label: 'ขาวดำ' },
              ]}
            />
            <FieldsMenu fields={opt.fields} onChange={(fields) => setOpt((o) => ({ ...o, fields }))} />
            <span className="ml-auto text-xs text-muted">
              A4 ได้ {perPage} ป้าย/แผ่น{pageCount ? ` · ${pageCount} แผ่น` : ''}
            </span>
          </div>

          <div ref={previewRef} className="min-h-0 flex-1 overflow-auto bg-surface-3 p-4">
            {tags.length ? (
              // ย่อแผ่น A4 ให้พอดีความกว้างกล่อง (ไม่กระทบขนาดตอนพิมพ์)
              <div className="mx-auto flex w-fit flex-col gap-4 [&_.qr-sheet]:shadow-lg" style={{ zoom: previewZoom }}>
                <Sheets tags={tags} stores={stores} opt={opt} />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted">
                <QrIcon className="size-10 text-line-strong" />
                เลือกไวน์เพื่อดูตัวอย่างป้าย
              </div>
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

const FIELD_LABELS: Array<[keyof Fields, string]> = [
  ['country', 'ประเทศ'],
  ['place', 'คลัง · Rack'],
  ['rating', 'คะแนน RP/WS'],
  ['maturity', 'ช่วงดื่ม'],
  ['price', 'ราคา'],
  ['hole', 'วงเจาะรูห้อย'],
]

/** ปุ่ม "ข้อมูลบนป้าย" เปิดรายการสวิตช์ */
function FieldsMenu({ fields, onChange }: { fields: Fields; onChange: (f: Fields) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  const on = FIELD_LABELS.filter(([k]) => fields[k]).length
  return (
    <div ref={ref} className="relative">
      <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SlidersHorizontal className="size-4" /> ข้อมูลบนป้าย ({on})
      </Button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-60 rounded-xl border border-line bg-surface p-2 shadow-xl">
          {FIELD_LABELS.map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              {label}
              <Switch checked={fields[k]} label={label} onChange={(v) => onChange({ ...fields, [k]: v })} />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
