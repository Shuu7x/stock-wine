import { http, HttpResponse } from 'msw/http'
import type { Database } from '@/lib/database.types'
import { db, MOCK_USER, persist } from '@/mocks/db'
import { filterRows, pgError, requireAuth, respondList, respondMaybeObject, rest } from '@/mocks/postgrest'

type StockUpdate = Database['public']['Tables']['stock_items']['Update']

export const stockIdentity = (r: {
  store_id: number
  wine_name: string
  vintage: number | null
  rack: string | null
}) => `${r.store_id}|${r.wine_name.trim().toLowerCase()}|${r.vintage ?? 0}|${(r.rack ?? '').trim().toLowerCase()}`

export const stockHandlers = [
  http.get(rest('stores'), ({ request }) => respondList(request, db.stores)),

  http.get(rest('stock_items'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(request, db.stock_items)
  }),

  http.patch(rest('stock_items'), async ({ request }) => {
    if (!requireAuth(request)) return pgError('permission denied', 401, '42501')
    const patch = (await request.json()) as StockUpdate
    if ('balance' in patch) return pgError('permission denied for column balance', 403, '42501')
    const q = new URL(request.url).searchParams
    const targets = filterRows(db.stock_items, q)
    for (const item of targets) {
      const next = { ...item, ...patch }
      if (!next.wine_name?.trim()) return pgError('ชื่อไวน์ห้ามว่าง', 400, '23514')
      if (next.deleted_at == null) {
        const clash = db.stock_items.find(
          (o) => o.id !== item.id && o.deleted_at == null && stockIdentity(o) === stockIdentity(next),
        )
        if (clash) {
          return pgError(
            `มี "${next.wine_name}" ปี ${next.vintage ?? 'NV'} ที่ rack ${next.rack ?? '-'} ในคลังนี้อยู่แล้ว`,
            409,
            '23505',
          )
        }
      }
    }
    const now = new Date().toISOString()
    for (const item of targets) {
      Object.assign(item, patch, { updated_at: now, updated_by: MOCK_USER.id })
    }
    persist()
    if (request.headers.get('prefer')?.includes('return=representation')) {
      return respondMaybeObject(request, targets)
    }
    return new HttpResponse(null, { status: 204 })
  }),
]
