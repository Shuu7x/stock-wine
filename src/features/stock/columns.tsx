import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { drinkStatus, fmtMaturity, fmtMoney, parseMaturity } from '@/lib/format'
import type { LookupValue } from '@/features/settings/api/settings.api'
import type { StockItem, Store } from './api/stock.api'

/** ฟิลด์ไวน์ที่ทั้งสต็อกและใบรับเข้าใช้ร่วมกัน (ชื่อตรงกับคอลัมน์ในตาราง) */
export type WineFields = {
  store_id: number | null
  rack: string | null
  country: string | null
  wine_name: string | null
  vintage: number | null
  rating_rp: number | null
  rating_ws: number | null
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
  return {
    countries: mergeOptions(of('country'), items.map((i) => i.country)),
    suppliers: mergeOptions(of('supplier'), items.map((i) => i.supplier)),
    allRacks: mergeOptions(of('rack'), items.map((i) => i.rack)),
    racksByStore,
  }
}
export type Lookups = ReturnType<typeof buildLookups>

export function storeName(stores: Store[], id: number | null | undefined) {
  return stores.find((s) => s.id === id)?.name ?? ''
}

const parseInt0to100 = (t: string) => {
  const s = t.trim()
  if (!s) return null
  const n = Number(s.replace(/\s*(pts?|points?|คะแนน)$/i, ''))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

export function MaturityBadge({ from, to }: { from: number | null; to: number | null }) {
  const text = fmtMaturity(from, to)
  if (!text) return null
  const s = drinkStatus(from, to)
  const tone = s === 'ready' ? 'success' : s === 'young' ? 'info' : s === 'past' ? 'warning' : 'neutral'
  return (
    <span className="flex items-center gap-1.5">
      <span className="tabular-nums">{text}</span>
      <Badge tone={tone}>{s === 'ready' ? 'ดื่มได้' : s === 'young' ? 'ยังไม่ถึง' : 'เลยช่วง'}</Badge>
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
    width: 120,
    options: lookups.countries,
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
  const rp: GridColumn<R> = {
    key: 'rating_rp',
    title: 'RP',
    subtitle: 'Robert Parker',
    width: 72,
    type: 'number',
    align: 'center',
    parse: parseInt0to100,
  }
  const ws: GridColumn<R> = {
    key: 'rating_ws',
    title: 'WS',
    subtitle: 'Wine Spectator',
    width: 72,
    type: 'number',
    align: 'center',
    parse: parseInt0to100,
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
  return { store, country, rack, wine, vintage, rp, ws, maturity, price, supplier, purchaseDate, remark }
}

export function wineLabel(w: { wine_name: string | null; vintage: number | null }) {
  return `${w.wine_name ?? ''} ${w.vintage ?? 'NV'}`.trim()
}

/** คีย์ใช้จับคู่รายการในคลัง (ตรงกับ unique index stock_items_identity_uq) */
export function identityKey(w: {
  store_id: number | null
  wine_name: string | null
  vintage: number | null
  rack: string | null
}) {
  return `${w.store_id}|${(w.wine_name ?? '').trim().toLowerCase()}|${w.vintage ?? 0}|${(w.rack ?? '').trim().toLowerCase()}`
}
