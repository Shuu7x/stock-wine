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
import { stockItemsOptions, storesOptions, type StockItem } from '@/features/stock/api/stock.api'
import { storeName } from '@/features/stock/columns'
import { cn } from '@/lib/cn'
import { fmtMaturity, fmtMoney } from '@/lib/format'
import { loadDraft, saveDraft } from '@/lib/use-local-draft'

/**
 * ขนาดป้ายข้อมูล (มม.) — ตัดแปะบนป้ายสวมคอขวดที่มีรูอยู่แล้ว ใต้ส่วนรู
 */
const SIZES = {
  s: { label: 'เล็ก 38×44', w: 38, h: 44 },
  m: { label: 'มาตรฐาน 48×55', w: 48, h: 55 },
  l: { label: 'ใหญ่ 62×70', w: 62, h: 70 },
} as const
type SizeKey = keyof typeof SIZES

// กระดาษ A4 ขอบ 6 มม. · เว้นระหว่างป้าย 2 มม. ให้ตัดมุมโค้งได้
const PAGE = { w: 210, h: 297, margin: 6, gap: 2 }

type Fields = { country: boolean; place: boolean; rating: boolean; maturity: boolean; price: boolean }
/** color = ชื่อสีไวน์ ราคาสีแดง · mono = ขาวดำ ประหยัดหมึก */
type TagStyle = 'color' | 'mono'
type Options = { size: SizeKey; style: TagStyle; fields: Fields }
const OPTIONS_KEY = 'stock-wine:qr-options:v3'
const DEFAULT_OPTIONS: Options = {
  size: 'm',
  style: 'color',
  fields: { country: true, place: true, rating: true, maturity: true, price: true },
}

function sheetLayout(size: SizeKey) {
  const s = SIZES[size]
  const fit = (avail: number, n: number) => Math.max(1, Math.floor((avail + PAGE.gap) / (n + PAGE.gap)))
  const cols = fit(PAGE.w - PAGE.margin * 2, s.w)
  const rows = fit(PAGE.h - PAGE.margin * 2, s.h)
  return { cols, rows, per: cols * rows }
}

function Tag({ it, opt }: { it: StockItem; opt: Options }) {
  const s = SIZES[opt.size]
  const f = opt.fields
  const mono = opt.style === 'mono'
  // หน่วยขนาดตามความกว้างป้าย: ป้ายมาตรฐาน (48 มม.) = 1
  const u = s.w / 48
  const mm = (n: number) => `${(n * u).toFixed(2)}mm`
  const maturity = fmtMaturity(it.maturity_from, it.maturity_to)
  const rating = [it.rating_rp != null && `${it.rating_rp} RP`, it.rating_ws != null && `${it.rating_ws} WS`].filter(Boolean).join(' · ')
  const ink = mono ? '#111' : 'var(--color-brand-900)'
  const showPrice = f.price && it.price_per_bottle != null
  const showRack = f.place && !!it.rack

  return (
    <div className="relative overflow-hidden bg-white" style={{ width: `${s.w}mm`, height: `${s.h}mm` }}>
      <div
        className="flex h-full flex-col"
        style={{ padding: `${mm(3)} ${mm(3)} ${mm(2.6)}`, color: '#111', fontFamily: 'var(--font-doc)' }}
      >
        {/* ชื่อไวน์ · ประเทศ */}
        <div className="line-clamp-2 text-center leading-[1.15] font-bold" style={{ fontSize: mm(3.8), color: ink }}>
          {it.wine_name}
        </div>
        {f.country && it.country && (
          <div className="truncate text-center" style={{ fontSize: mm(2.3), color: '#555', marginTop: mm(0.5) }}>
            {it.country}
          </div>
        )}
        <div style={{ borderTop: `0.2mm solid ${mono ? '#999' : 'var(--color-brand-200)'}`, margin: `${mm(1.6)} ${mm(4)} ${mm(1.4)}` }} />

        {/* Vintage / Rating / Maturity */}
        <div className="leading-[1.4] font-bold" style={{ fontSize: mm(2.6) }}>
          <div className="truncate">Vintage {it.vintage ?? 'NV'}</div>
          {f.rating && <div className="truncate">Rating {rating || 'N/A'}</div>}
          {f.maturity && <div className="truncate">Maturity {maturity || 'N/A'}</div>}
        </div>

        {/* Rack · ราคา | QR */}
        <div className="mt-auto flex items-end justify-between" style={{ gap: mm(1.5), paddingTop: mm(1.2) }}>
          <div className="min-w-0 leading-[1.25]">
            {showRack && (
              <div className="font-bold" style={{ fontSize: mm(3) }}>
                {it.rack}
              </div>
            )}
            {showPrice && (
              <div className="font-bold whitespace-nowrap" style={{ fontSize: mm(3), color: mono ? '#111' : 'var(--color-danger-600)' }}>
                @{fmtMoney(it.price_per_bottle!)}฿
              </div>
            )}
            <div className="font-mono" style={{ fontSize: mm(1.4), color: '#888', letterSpacing: '0.05em', marginTop: mm(0.4) }}>
              {it.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
          <div className="shrink-0" style={{ width: mm(15), height: mm(15) }}>
            <QrCode value={itemUrl(it.id)} margin={0} className="block size-full" />
          </div>
        </div>
      </div>
      {/* แนวตัด */}
      <svg className="pointer-events-none absolute inset-0" width={`${s.w}mm`} height={`${s.h}mm`} viewBox={`0 0 ${s.w} ${s.h}`} aria-hidden>
        <rect x={0.15} y={0.15} width={s.w - 0.3} height={s.h - 0.3} rx={2.5} fill="none" stroke="#b5b5b5" strokeWidth={0.25} strokeDasharray="1.2 0.9" />
      </svg>
    </div>
  )
}

function Sheets({ tags, opt }: { tags: StockItem[]; opt: Options }) {
  const s = SIZES[opt.size]
  const { cols, per } = sheetLayout(opt.size)
  const pages = Array.from({ length: Math.ceil(tags.length / per) }, (_, i) => tags.slice(i * per, (i + 1) * per))
  return (
    <>
      {pages.map((p, i) => (
        <div
          key={i}
          className="qr-sheet bg-white"
          style={{ width: `${PAGE.w}mm`, height: `${PAGE.h}mm`, padding: `${PAGE.margin}mm` } as CSSProperties}
        >
          <div
            className="grid justify-center"
            style={{ gridTemplateColumns: `repeat(${cols}, ${s.w}mm)`, gridAutoRows: `${s.h}mm`, gap: `${PAGE.gap}mm` }}
          >
            {p.map((it, j) => (
              <Tag key={`${it.id}-${j}`} it={it} opt={opt} />
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
  const perPage = sheetLayout(opt.size).per
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
        description="พิมพ์ A4 ตัดตามเส้นประ แปะบนป้ายสวมคอขวด · สแกน QR เปิดหน้าไวน์ในระบบ"
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
                <Sheets tags={tags} opt={opt} />
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
            <Sheets tags={tags} opt={opt} />
          </div>,
          document.body,
        )}
    </div>
  )
}

const FIELD_LABELS: Array<[keyof Fields, string]> = [
  ['country', 'ประเทศ'],
  ['place', 'Rack'],
  ['rating', 'คะแนน RP/WS'],
  ['maturity', 'ช่วงดื่ม'],
  ['price', 'ราคา'],
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
