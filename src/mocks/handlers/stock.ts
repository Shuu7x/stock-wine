import { http, HttpResponse } from 'msw/http'
import type { Database, Tables } from '@/lib/database.types'
import { db, logStockChange, MOCK_USER, persist, PgError } from '@/mocks/db'
import {
  emailOf,
  filterRows,
  pgError,
  requireAuth,
  respondList,
  respondMaybeObject,
  rest,
  rpc,
} from '@/mocks/postgrest'

type StockItem = Tables<'stock_items'>
type StockUpdate = Database['public']['Tables']['stock_items']['Update']

export const stockIdentity = (r: {
  store_id: number
  wine_name: string
  vintage: number | null
  rack: string | null
}) => `${r.store_id}|${r.wine_name.trim().toLowerCase()}|${r.vintage ?? 0}|${(r.rack ?? '').trim().toLowerCase()}`

/** ตรวจ unique index stock_items_identity_uq บนชุดข้อมูลที่จะบันทึก */
function assertUnique(items: StockItem[]) {
  const seen = new Map<string, StockItem>()
  for (const it of items) {
    if (it.deleted_at) continue
    const key = stockIdentity(it)
    if (seen.has(key)) {
      throw new PgError(
        `มี "${it.wine_name}" ปี ${it.vintage ?? 'NV'} ที่ rack ${it.rack ?? '-'} ในคลังนี้อยู่แล้ว`,
        '23505',
      )
    }
    seen.set(key, it)
  }
}

const blank = (v: unknown) => (typeof v === 'string' ? v.trim() || null : v)

// เลียนแบบ public.save_stock_changes
function saveStockChanges(
  email: string,
  updates: Array<{ id: string; patch: StockUpdate }>,
  deletes: string[],
) {
  const items = structuredClone(db.stock_items)
  const logs: Array<[StockItem, StockItem]> = []
  const now = new Date().toISOString()
  let count = 0
  for (const { id, patch } of updates ?? []) {
    if ('balance' in patch) throw new PgError('permission denied for column balance', '42501')
    if ('wine_name' in patch && !String(patch.wine_name ?? '').trim()) throw new PgError('ชื่อไวน์ห้ามว่าง')
    const item = items.find((s) => s.id === id && !s.deleted_at)
    if (!item) continue
    const before = structuredClone(item)
    for (const [k, v] of Object.entries(patch)) (item as Record<string, unknown>)[k] = blank(v)
    item.updated_at = now
    item.updated_by = MOCK_USER.id
    logs.push([before, structuredClone(item)])
    count++
  }
  for (const id of deletes ?? []) {
    const item = items.find((s) => s.id === id && !s.deleted_at)
    if (!item) continue
    const before = structuredClone(item)
    item.deleted_at = now
    item.deleted_by = MOCK_USER.id
    logs.push([before, structuredClone(item)])
    count++
  }
  assertUnique(items)
  db.stock_items = items
  for (const [b, a] of logs) logStockChange(b, a, email)
  persist()
  return count
}

export const stockHandlers = [
  http.get(rest('stores'), ({ request }) => respondList(request, db.stores)),

  http.get(rest('stock_items'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(request, db.stock_items)
  }),

  http.get(rest('stock_item_logs'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(request, db.stock_item_logs)
  }),

  http.patch(rest('stock_items'), async ({ request }) => {
    if (!requireAuth(request)) return pgError('permission denied', 401, '42501')
    const patch = (await request.json()) as StockUpdate
    if ('balance' in patch) return pgError('permission denied for column balance', 403, '42501')
    const q = new URL(request.url).searchParams
    const targets = filterRows(db.stock_items, q)
    const next = db.stock_items.map((it) => (targets.includes(it) ? { ...it, ...patch } : it))
    try {
      assertUnique(next)
    } catch (e) {
      return pgError((e as PgError).message, 409, '23505')
    }
    const now = new Date().toISOString()
    const email = emailOf(request)
    for (const item of targets) {
      const before = structuredClone(item)
      Object.assign(item, patch, { updated_at: now, updated_by: MOCK_USER.id })
      logStockChange(before, item, email)
    }
    persist()
    if (request.headers.get('prefer')?.includes('return=representation')) {
      return respondMaybeObject(request, targets)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(
    rest('rpc/save_stock_changes'),
    rpc<{ p_updates: Array<{ id: string; patch: StockUpdate }>; p_deletes: string[] }>((req, a) =>
      saveStockChanges(emailOf(req), a.p_updates, a.p_deletes),
    ),
  ),
]
