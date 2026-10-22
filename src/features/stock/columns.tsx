import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { drinkStatus, fmtMaturity, fmtMoney, parseMaturity } from '@/lib/format'
import type { LookupValue } from '@/features/settings/api/settings.api'
import { flagOf } from '@/lib/flags'
import { parseRating } from '@/lib/rating'
import { RatingChips } from '@/components/ui/rating-chip'
import type { StockItem, Store } from './api/stock.api'

/** ฟิลด์ไวน์ที่ทั้งสต็อกและใบรับเข้าใช้ร่วมกัน (ชื่อตรงกับคอลัมน์ในตาราง) */
export type WineFields = {
  store_id: number | null
  rack: string | null
  country: string | null
  wine_name: string | null
  vintage: number | null
  wine_type: string | null
  bottle_size: string | null
  region: string | null
  rating: string | null
  maturity_from: number | null
  maturity_to: number | null
  price_per_bottle: number | null
  supplier: string | null
  purchase_date: string | null
  remark: string | null
}

const byName = (a: string, b: string) => a.localeCompare(b, 'th', { numeric: true })

/** ค่าจากหน้าตั้งค่าก่อน (ตามลำดับที่ตั้ง) ตามด้วยค่าที่มีในสต็อกแต่ยังไม่อยู่ในรายการ · ค่าที่ปิดใช้งานไม่แสดง */
function mergeOptions(configured: LookupValue[], fromStock: Array<string | null | undefined>) {
  const active = configured.filter((l) => l.is_active).sort((a, b) => a.sort_order - b.sort_order || byName(a.value, b.value))
  const hidden = new Set(configured.filter((l) => !l.is_active).map((l) => l.value.trim().toLowerCase()))
  const out = active.map((l) => l.value.trim())
  const seen = new Set(out.map((v) => v.toLowerCase()))
  const extra = [...new Set(fromStock.map((x) => x?.trim()).filter((x): x is string => !!x))]
    .filter((v) => !seen.has(v.toLowerCase()) && !hidden.has(v.toLowerCase()))
    .sort(byName)
  return [...out, ...extra]
}

/** ตัวเลือกที่ใช้บ่อย = รายการในหน้าตั้งค่า + ค่าที่มีอยู่จริงในสต็อก */
export function buildLookups(items: StockItem[], configured: LookupValue[] = []) {
  const of = (c: LookupValue['category'], storeId?: number) =>
    configured.filter((l) => l.category === c && (storeId == null || l.store_id === storeId))
  const storeIds = new Set([...items.map((i) => i.store_id), ...of('rack').map((l) => l.store_id!)])
  const racksByStore = new Map<number, string[]>()
  for (const id of storeIds) {
    racksByStore.set(id, mergeOptions(of('rack', id), items.filter((i) => i.store_id === id).map((i) => i.rack)))
  }
  // แคว้นแยกตามประเทศจากข้อมูลจริง (ข้อมูลหลักไม่ผูกประเทศ → ขึ้นทุกประเทศ)
  const regionsByCountry = new Map<string, string[]>()
  const countriesSeen = new Set([...(items.map((i) => i.country).filter(Boolean) as string[]), ...(of('region').map((l) => l.parent).filter(Boolean) as string[])])
  for (const country of countriesSeen) {
    // แคว้นของประเทศนี้ในข้อมูลหลัก + ที่พบในสต็อก · แคว้นที่ยังไม่ระบุประเทศขึ้นทุกประเทศ
    const configured = of('region').filter((l) => !l.parent || l.parent.trim().toLowerCase() === country.trim().toLowerCase())
    regionsByCountry.set(country, mergeOptions(configured, items.filter((i) => i.country === country).map((i) => i.region)))
  }
  return {
    countries: mergeOptions(of('country'), items.map((i) => i.country)),
    wineTypes: mergeOptions(of('wine_type'), items.map((i) => i.wine_type)),
    bottleSizes: mergeOptions(of('bottle_size'), ['Normal', ...items.map((i) => i.bottle_size)]),
    regions: mergeOptions(of('region'), items.map((i) => i.region)),
    regionsByCountry,
    suppliers: mergeOptions(of('supplier'), items.map((i) => i.supplier)),
    allRacks: mergeOptions(of('rack'), items.map((i) => i.rack)),
    racksByStore,
  }
}
export type Lookups = ReturnType<typeof buildLookups>

export function storeName(stores: Store[], id: number | null | undefined) {
  return stores.find((s) => s.id === id)?.name ?? ''
}

/** ชิปประเภทไวน์ — โทนอ่อนแบบเดียวกับชิปคอลัมน์อื่น (พื้นจาง · ตัวอักษรเข้ม) แต่ละประเภทคนละสี · ที่เพิ่มเองเป็นสีเทา */
const TYPE_STYLE: Record<string, { bg: string; fg: string; ring: string }> = {
  red: { bg: '#fdecec', fg: '#b42323', ring: '#f3c6c6' },
  white: { bg: '#f3f6e2', fg: '#5b6812', ring: '#dbe3ad' },
  champagne: { bg: '#fdf3d7', fg: '#8f6400', ring: '#f0d690' },
  burgundy: { bg: '#f4ecfa', fg: '#6a2c91', ring: '#dccaeb' },
  whisky: { bg: '#fcefe4', fg: '#a3500f', ring: '#f1d0b4' },
}
/** ชื่อประเทศพร้อมธงชาติ (ไม่รู้จักประเทศ = ชื่ออย่างเดียว) */
export function CountryName({ country }: { country: string | null }) {
  if (!country) return null
  const flag = flagOf(country)
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {flag && (
        <span aria-hidden className="flag-emoji shrink-0 text-base leading-none">
          {flag}
        </span>
      )}
      <span className="truncate">{country}</span>
    </span>
  )
}

/** ขนาดขวด: Normal แสดงจางๆ · ขนาดอื่น (Mg. ฯลฯ) เด่นขึ้นให้สังเกตง่าย */
export function SizeTag({ size }: { size: string | null }) {
  const s = size?.trim() || 'Normal'
  return s.toLowerCase() === 'normal' ? (
    <span className="text-xs text-muted">Normal</span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-gold-100 px-1.5 text-xs leading-5 font-bold text-gold-700 ring-1 ring-gold-500/40 ring-inset">{s}</span>
  )
}

export function WineTypeTag({ type }: { type: string }) {
  const st = TYPE_STYLE[type.trim().toLowerCase()] ?? { bg: '#f3f0f0', fg: '#5a4f52', ring: '#e0d8d9' }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-px text-xs leading-5 font-semibold"
      style={{ background: st.bg, color: st.fg, boxShadow: `inset 0 0 0 1px ${st.ring}` }}
    >
      {type}
    </span>
  )
}

const DRINK_LABEL = { ready: 'ดื่มได้', young: 'ยังไม่ถึง', past: 'เลยช่วง', unknown: '' } as const

/** ข้อความสถานะการดื่ม — ใช้ทั้งป้ายในตาราง ตัวกรอง และไฟล์ส่งออก */
export function drinkLabel(from: number | null, to: number | null): string {
  return DRINK_LABEL[drinkStatus(from, to)]
}

export function MaturityBadge({ from, to }: { from: number | null; to: number | null }) {
  const text = fmtMaturity(from, to)
  if (!text) return null
  const s = drinkStatus(from, to)
  const tone = s === 'ready' ? 'success' : s === 'young' ? 'info' : s === 'past' ? 'warning' : 'neutral'
  return (
    <span className="flex items-center gap-1.5">
      <span className="tabular-nums">{text}</span>
      <Badge tone={tone}>{DRINK_LABEL[s]}</Badge>
    </span>
  )
}

/** คอลัมน์มาตรฐานของข้อมูลไวน์ — หน้าไหนใช้คอลัมน์ไหนเลือกเอา */
export function wineColumns<R extends WineFields>(stores: Store[], lookups: Lookups) {
  const store: GridColumn<R> = {
    key: 'store_id',
    title: 'Store',
    subtitle: 'คลัง',
    width: 150,
    type: 'select',
    format: (v) => storeName(stores, v as number | null),
    parse: (t) => {
      const s = t.trim().toLowerCase()
      if (!s) return null
      const hit = stores.find(
        (x) =>
          x.is_active && (x.name.toLowerCase() === s || x.code.toLowerCase() === s || String(x.id) === s),
      )
      return hit ? hit.id : undefined
    },
    // เลือกได้เฉพาะคลังที่เปิดใช้งาน (คลังที่ปิดยังแสดงชื่อในข้อมูลเดิมได้)
    options: stores.filter((s) => s.is_active).map((s) => s.name),
  }
  const country: GridColumn<R> = {
    key: 'country',
    title: 'Country',
    subtitle: 'ประเทศ',
    width: 140,
    options: lookups.countries,
    render: (r) => <CountryName country={r.country} />,
  }
  const region: GridColumn<R> = {
    key: 'region',
    title: 'Region',
    subtitle: 'แคว้น',
    width: 140,
    // แคว้นของประเทศในแถวนั้นขึ้นก่อน
    options: (row) => (row.country ? (lookups.regionsByCountry.get(row.country) ?? lookups.regions) : lookups.regions),
  }
  const bottleSize: GridColumn<R> = {
    key: 'bottle_size',
    title: 'Size',
    subtitle: 'ขนาด',
    width: 96,
    align: 'center',
    options: lookups.bottleSizes,
    // ว่าง = Normal
    parse: (t) => t.trim() || 'Normal',
    render: (r) => <SizeTag size={r.bottle_size} />,
  }
  const wineType: GridColumn<R> = {
    key: 'wine_type',
    title: 'Type',
    subtitle: 'ประเภท',
    width: 120,
    options: lookups.wineTypes,
    render: (r) => (r.wine_type ? <WineTypeTag type={r.wine_type} /> : null),
  }
  const rack: GridColumn<R> = {
    key: 'rack',
    title: 'Wine racks',
    subtitle: 'ชั้นวาง',
    width: 96,
    options: (row) => (row.store_id ? (lookups.racksByStore.get(row.store_id) ?? []) : lookups.allRacks),
  }
  const wine: GridColumn<R> = {
    key: 'wine_name',
    title: 'Name of wine',
    frozen: true,
    subtitle: 'ชื่อไวน์',
    width: 300,
  }
  const vintage: GridColumn<R> = {
    key: 'vintage',
    title: 'Year',
    subtitle: 'ปี (ว่าง = NV)',
    width: 76,
    type: 'number',
    align: 'center',
    parse: (t) => {
      const s = t.trim()
      if (!s || /^n\.?v\.?$/i.test(s)) return null
      const n = Number(s)
      return Number.isInteger(n) && n >= 1800 && n <= 2200 ? n : undefined
    },
  }
  const rating: GridColumn<R> = {
    key: 'rating',
    title: 'Rate',
    subtitle: 'ชั้นวาง',
    width: 190,
    placeholder: '100RP, 98WS',
    parse: parseRating,
    render: (r) => <RatingChips rating={r.rating} wrap={false} />,
  }
  const maturity: GridColumn<R> = {
    key: 'maturity',
    title: 'Maturity',
    subtitle: 'ปีที่ดื่มได้ เช่น 2025-2040',
    width: 170,
    placeholder: '2025-2040',
    get: (r) => fmtMaturity(r.maturity_from, r.maturity_to) || null,
    parse: (t) => {
      const m = parseMaturity(t)
      if (!m) return undefined
      return fmtMaturity(m.from, m.to) || null
    },
    set: (r, v) => {
      const m = parseMaturity(String(v ?? '')) ?? { from: null, to: null }
      return { ...r, maturity_from: m.from, maturity_to: m.to }
    },
    render: (r) => <MaturityBadge from={r.maturity_from} to={r.maturity_to} />,
    // กรองด้วยสถานะ (ดื่มได้ / ยังไม่ถึง / เลยช่วง) แทนช่วงปี
    filterValue: (r) => drinkLabel(r.maturity_from, r.maturity_to),
    // พิมพ์ปีในตัวกรอง เช่น 2030 = ไวน์ที่ช่วงดื่มได้ครอบคลุมปีนั้น
    yearRange: (r) => ({ from: r.maturity_from, to: r.maturity_to }),
  }
  const price: GridColumn<R> = {
    key: 'price_per_bottle',
    title: 'Price/Btl.',
    subtitle: 'บาท/ขวด',
    width: 110,
    type: 'number',
    align: 'right',
    format: (v) => fmtMoney(v as number | null),
    parse: (t) => {
      const s = t.trim().replace(/[,\s฿]/g, '')
      if (!s) return null
      const n = Number(s)
      return Number.isFinite(n) && n >= 0 ? n : undefined
    },
  }
  const supplier: GridColumn<R> = {
    key: 'supplier',
    title: 'ซื้อจากใคร',
    subtitle: 'ผู้ขาย',
    width: 150,
    options: lookups.suppliers,
  }
  const purchaseDate: GridColumn<R> = {
    key: 'purchase_date',
    title: 'วันที่ซื้อ',
    width: 120,
    type: 'date',
    align: 'center',
    placeholder: 'วว/ดด/ปปปป',
  }
  const remark: GridColumn<R> = {
    key: 'remark',
    title: 'Remark',
    subtitle: 'หมายเหตุ',
    width: 200,
  }
  return { store, country, region, wineType, bottleSize, rack, wine, vintage, rating, maturity, price, supplier, purchaseDate, remark }
}

export function wineLabel(w: { wine_name: string | null; vintage: number | null; bottle_size?: string | null }) {
  // ขนาดพิเศษ (ไม่ใช่ Normal) ต่อท้ายชื่อ ให้แยกขวดใหญ่/เล็กออกจากกันได้
  const size = w.bottle_size?.trim()
  return `${w.wine_name ?? ''} ${w.vintage ?? 'NV'}${size && size.toLowerCase() !== 'normal' ? ` (${size})` : ''}`.trim()
}

/** คีย์ใช้จับคู่รายการในคลัง (ตรงกับ unique index stock_items_identity_uq) */
export function identityKey(w: {
  store_id: number | null
  wine_name: string | null
  vintage: number | null
  rack: string | null
  bottle_size?: string | null
}) {
  // ไวน์เดียวกันคนละขนาด = คนละรายการ (ตรงกับ unique index ในฐานข้อมูล)
  return `${w.store_id}|${(w.wine_name ?? '').trim().toLowerCase()}|${w.vintage ?? 0}|${(w.rack ?? '').trim().toLowerCase()}|${(w.bottle_size?.trim() || 'Normal').toLowerCase()}`
}
