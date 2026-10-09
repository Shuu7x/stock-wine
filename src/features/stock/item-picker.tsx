import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { GridColumn, Suggestion } from '@/components/data-grid/types'
import { formatValue, getValue, matchesWords } from '@/components/data-grid/utils'
import { lookupValuesOptions } from '@/features/settings/api/settings.api'
import { fmtInt } from '@/lib/format'
import { stockItemsOptions, storesOptions, type StockItem, type Store } from './api/stock.api'
import { buildLookups, storeName, wineColumns, wineLabel, type Lookups } from './columns'

/** แถวของเอกสารที่อ้างถึงไวน์ในสต็อก (เบิก · ขาย · โอนย้าย · ปรับยอด) */
export type PickerRow = {
  _id: string
  stock_item_id: string | null
  /** ชื่อที่พิมพ์/วางมาแต่ยังจับคู่กับสต็อกไม่ได้ */
  wine_text: string | null
}

/** ข้อมูลที่หน้าเอกสารต้องใช้ร่วมกัน */
export function useStockData() {
  const storesQ = useQuery(storesOptions())
  const itemsQ = useQuery(stockItemsOptions())
  const lookupQ = useQuery(lookupValuesOptions())
  const stores = useMemo(() => storesQ.data ?? [], [storesQ.data])
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data])
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const lookups = useMemo(() => buildLookups(items, lookupQ.data), [items, lookupQ.data])
  return { stores, items, byId, lookups, loading: itemsQ.isLoading }
}

/**
 * คอลัมน์สำหรับเลือกไวน์จากสต็อก + คอลัมน์ข้อมูลไวน์แบบอ่านอย่างเดียว
 * pool = ไวน์ที่เลือกได้ (เช่น เฉพาะที่มีของ / เฉพาะคลังที่เลือก)
 */
export function makePicker<R extends PickerRow>(opts: {
  stores: Store[]
  lookups: Lookups
  byId: Map<string, StockItem>
  pool: () => StockItem[]
  /** เลือกไวน์แล้วเติมค่าอื่นในแถว (เช่น จำนวนเริ่มต้น ราคา) */
  onPick?: (row: R, item: StockItem) => R
}) {
  const { stores, lookups, byId, pool, onPick } = opts
  const c = wineColumns<StockItem>(stores, lookups)
  const item = (r: R) => (r.stock_item_id ? byId.get(r.stock_item_id) : undefined)

  /** คอลัมน์ของไวน์ (อ่านอย่างเดียว) แสดงค่าจากไวน์ที่เลือกในแถว */
  const lift = (col: GridColumn<StockItem>, override?: Partial<GridColumn<R>>): GridColumn<R> => ({
    key: col.key,
    title: col.title,
    subtitle: col.subtitle,
    width: col.width,
    type: col.type,
    align: col.align,
    readOnly: true,
    get: (r) => {
      const it = item(r)
      return it ? getValue(col, it) : null
    },
    format: (_v, r) => {
      const it = item(r)
      return it ? formatValue(col, it) : ''
    },
    filterValue: col.filterValue
      ? (r) => {
          const it = item(r)
          return it ? col.filterValue!(it) : ''
        }
      : undefined,
    render: col.render
      ? (r) => {
          const it = item(r)
          return it ? col.render!(it) : null
        }
      : undefined,
    ...override,
  })

  const apply = (r: R, it: StockItem): R => {
    const next = { ...r, stock_item_id: it.id, wine_text: null }
    return onPick ? onPick(next, it) : next
  }

  const wine: GridColumn<R> = {
    key: 'wine',
    title: 'Name of wine',
    subtitle: 'ค้นหาจากสต็อก',
    width: 300,
    placeholder: 'พิมพ์ชื่อไวน์…',
    get: (r) => item(r)?.wine_name ?? r.wine_text,
    render: (r) =>
      item(r) ? item(r)!.wine_name : r.wine_text ? <span className="text-danger-700">{r.wine_text}</span> : null,
    // พิมพ์/วางชื่อเอง: ถ้าตรงกับไวน์ในสต็อกรายการเดียว ผูกให้อัตโนมัติ
    set: (r, v) => {
      const text = String(v ?? '').trim()
      if (!text) return { ...r, stock_item_id: null, wine_text: null }
      const t = text.toLowerCase()
      const hits = pool().filter((i) => i.wine_name.toLowerCase() === t || wineLabel(i).toLowerCase() === t)
      return hits.length === 1 ? apply(r, hits[0]) : { ...r, stock_item_id: null, wine_text: text }
    },
    suggest: (q) =>
      pool()
        .filter((i) => !q || matchesWords(`${i.wine_name} ${i.vintage ?? 'nv'} ${i.country ?? ''} ${i.rack ?? ''} ${storeName(stores, i.store_id)}`, q))
        .sort((a, b) => a.wine_name.localeCompare(b.wine_name) || a.store_id - b.store_id)
        .slice(0, 40)
        .map<Suggestion<R>>((i) => ({
          key: i.id,
          label: wineLabel(i),
          detail: `${storeName(stores, i.store_id)} · Rack ${i.rack ?? '-'} · ${i.country ?? '-'}`,
          aside: `คงเหลือ ${i.balance}`,
          apply: (r) => apply(r, i),
        })),
  }

  /** คงเหลือ → หลังทำรายการ */
  const balance = (subtitle: string, after: (r: R, it: StockItem) => number): GridColumn<R> => ({
    key: 'balance',
    title: 'Balance',
    subtitle,
    width: 116,
    type: 'number',
    align: 'right',
    readOnly: true,
    get: (r) => item(r)?.balance ?? null,
    render: (r) => {
      const it = item(r)
      if (!it) return null
      const a = after(r, it)
      return (
        <span className="tabular-nums">
          <span className="text-muted">{fmtInt(it.balance)} → </span>
          <b className={a < 0 ? 'text-danger-700' : 'text-brand-800'}>{fmtInt(a)}</b>
        </span>
      )
    },
  })

  return { c, item, lift, wine, balance }
}

/** ตรวจแถวทั่วไปของเอกสาร: ต้องเลือกไวน์จากรายการ */
export function wineError(r: PickerRow, it: StockItem | undefined) {
  if (it) return null
  return r.wine_text ? 'ไม่พบในสต็อก หรือมีหลายรายการชื่อนี้ — เลือกจากรายการ' : 'เลือกไวน์'
}
