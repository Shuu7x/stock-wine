import { http, HttpResponse } from 'msw/http'
import type { Tables } from '@/lib/database.types'
import { auditNow, db, MOCK_USER, persist, PgError } from '@/mocks/db'
import { filterRows, pgError, requireAuth, respondList, respondMaybeObject, rest } from '@/mocks/postgrest'

type Store = Tables<'stores'>
type Lookup = Tables<'lookup_values'>

/** ตอบตาม Prefer: return=representation (มี .select()) หรือ 201/204 เปล่า */
function written(request: Request, rows: unknown[], status = 201) {
  if (request.headers.get('prefer')?.includes('return=representation')) {
    return respondMaybeObject(request, rows)
  }
  return new HttpResponse(null, { status })
}

function guard(fn: () => Response | Promise<Response>) {
  return async () => {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof PgError) return pgError(e.message, 409, e.code)
      throw e
    }
  }
}

// เลียนแบบ check constraint + unique + trigger stores_guard_deactivate
function validateStores(stores: Store[], before?: Map<number, Store>) {
  const codes = new Set<string>()
  for (const st of stores) {
    if (!st.name?.trim()) throw new PgError('ชื่อคลังห้ามว่าง', '23514')
    if (!/^[A-Z0-9_-]{1,12}$/.test(st.code)) throw new PgError('รหัสคลังใช้ A-Z 0-9 _ - ไม่เกิน 12 ตัว', '23514')
    if (codes.has(st.code)) throw new PgError(`รหัสคลัง ${st.code} ซ้ำ`, '23505')
    codes.add(st.code)
    const old = before?.get(st.id)
    if (old?.is_active && !st.is_active) {
      const hasStock = db.stock_items.some((i) => i.store_id === st.id && !i.deleted_at && i.balance > 0)
      if (hasStock) throw new PgError(`ปิดคลัง ${st.name} ไม่ได้ เพราะยังมีไวน์คงเหลือ`)
    }
  }
}

const lookupKey = (l: Lookup) => `${l.category}|${l.store_id ?? 0}|${l.value.trim().toLowerCase()}`

function validateLookups(rows: Lookup[]) {
  const seen = new Set<string>()
  for (const l of rows) {
    if (!l.value?.trim()) throw new PgError('ค่าห้ามว่าง', '23514')
    if ((l.category === 'rack') !== (l.store_id != null)) throw new PgError('ชั้นวางต้องระบุคลัง', '23514')
    const k = lookupKey(l)
    if (seen.has(k)) throw new PgError(`"${l.value}" ซ้ำในรายการ`, '23505')
    seen.add(k)
  }
}

export const settingsHandlers = [
  // ── stores ──
  http.post(rest('stores'), ({ request }) =>
    guard(async () => {
      if (!requireAuth(request)) return pgError('permission denied', 401, '42501')
      const body = (await request.json()) as Partial<Store> | Partial<Store>[]
      const input = Array.isArray(body) ? body : [body]
      const created: Store[] = input.map((b, i) => ({
        id: Math.max(0, ...db.stores.map((s) => s.id)) + 1 + i,
        code: String(b.code ?? '').trim().toUpperCase(),
        name: String(b.name ?? '').trim(),
        sort_order: b.sort_order ?? db.stores.length + 1 + i,
        is_active: b.is_active ?? true,
        ...auditNow(),
      }))
      validateStores([...db.stores, ...created])
      db.stores.push(...created)
      persist()
      return written(request, created)
    })(),
  ),
  http.patch(rest('stores'), ({ request }) =>
    guard(async () => {
      if (!requireAuth(request)) return pgError('permission denied', 401, '42501')
      const patch = (await request.json()) as Partial<Store>
      const targets = new Set(filterRows(db.stores, new URL(request.url).searchParams))
      const before = new Map(db.stores.map((s) => [s.id, s]))
      const next = db.stores.map((s) => (targets.has(s) ? { ...s, ...patch, updated_at: new Date().toISOString(), updated_by: MOCK_USER.id } : s))
      validateStores(next, before)
      db.stores = next
      persist()
      return written(request, next.filter((s) => targets.has(before.get(s.id)!)), 200)
    })(),
  ),

  // ── lookup_values ──
  http.get(rest('lookup_values'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(request, db.lookup_values)
  }),
  // insert / upsert (on_conflict=id)
  http.post(rest('lookup_values'), ({ request }) =>
    guard(async () => {
      if (!requireAuth(request)) return pgError('permission denied', 401, '42501')
      const body = (await request.json()) as Partial<Lookup> | Partial<Lookup>[]
      const input = Array.isArray(body) ? body : [body]
      const next = [...db.lookup_values]
      const out: Lookup[] = []
      for (const b of input) {
        const idx = b.id ? next.findIndex((l) => l.id === b.id) : -1
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...b, updated_at: new Date().toISOString(), updated_by: MOCK_USER.id } as Lookup
          out.push(next[idx])
        } else {
          const row: Lookup = {
            id: b.id ?? crypto.randomUUID(),
            category: b.category!,
            store_id: b.store_id ?? null,
            value: String(b.value ?? '').trim(),
            sort_order: b.sort_order ?? 0,
            is_active: b.is_active ?? true,
            ...auditNow(),
          }
          next.push(row)
          out.push(row)
        }
      }
      validateLookups(next)
      db.lookup_values = next
      persist()
      return written(request, out)
    })(),
  ),

  // ── app_settings ──
  http.get(rest('app_settings'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    return respondList(request, db.app_settings)
  }),
  http.post(rest('app_settings'), ({ request }) =>
    guard(async () => {
      if (!requireAuth(request)) return pgError('permission denied', 401, '42501')
      const body = (await request.json()) as Array<{ key: string; value: unknown }> | { key: string; value: unknown }
      const input = Array.isArray(body) ? body : [body]
      for (const b of input) {
        if (!/^[a-z][a-z0-9_]*$/.test(b.key)) throw new PgError(`key ไม่ถูกต้อง: ${b.key}`, '23514')
        const cur = db.app_settings.find((s) => s.key === b.key)
        if (cur) Object.assign(cur, { value: b.value, updated_at: new Date().toISOString(), updated_by: MOCK_USER.id })
        else db.app_settings.push({ key: b.key, value: b.value as Tables<'app_settings'>['value'], ...auditNow() })
      }
      persist()
      return written(request, db.app_settings.filter((s) => input.some((b) => b.key === s.key)))
    })(),
  ),
]
