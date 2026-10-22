import { http, HttpResponse } from 'msw/http'
import type { Tables } from '@/lib/database.types'
import { accessOf, db, persist, PgError } from '@/mocks/db'
import { denyUnless, emailOf, filterRows, pgError, requireAuth, respondList, respondMaybeObject, rest, rpc } from '@/mocks/postgrest'

type Role = Tables<'roles'>
type Profile = Tables<'profiles'>

const ALL_PERMS = ['stock.edit', 'withdraw', 'receive', 'transfer', 'sale', 'adjust', 'history.view', 'history.void', 'qr', 'settings.manage', 'users.manage']

function written(request: Request, rows: unknown[], status = 201) {
  if (request.headers.get('prefer')?.includes('return=representation')) return respondMaybeObject(request, rows)
  return new HttpResponse(null, { status })
}

const guard = async (fn: () => Promise<Response>) => {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof PgError) return pgError(e.message, 409, e.code)
    throw e
  }
}

/** เลียนแบบ trigger roles_guard: ผู้ดูแลมีสิทธิ์ครบเสมอ */
const fixRole = (r: Role): Role => (r.key === 'admin' ? { ...r, permissions: ALL_PERMS } : r)

/** เลียนแบบ trigger profiles_guard: ต้องเหลือผู้ดูแลที่ใช้งานได้อย่างน้อย 1 คน */
function checkAdmins(next: Profile[]) {
  if (!next.some((p) => p.role_key === 'admin' && p.is_active)) throw new PgError('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน')
}

export const accessHandlers = [
  http.post(rest('rpc/my_access'), rpc((req) => accessOf(emailOf(req)))),

  // ── roles ──
  http.get(rest('roles'), ({ request }) => respondList(request, requireAuth(request) ? db.roles : [])),
  http.post(rest('roles'), ({ request }) =>
    guard(async () => {
      const denied = denyUnless(request, 'users.manage', 'ไม่มีสิทธิ์จัดการผู้ใช้และสิทธิ์')
      if (denied) return denied
      const body = (await request.json()) as Partial<Role> | Partial<Role>[]
      const t = new Date().toISOString()
      const created = (Array.isArray(body) ? body : [body]).map((b) => {
        const key = String(b.key ?? '').trim()
        if (!/^[a-z0-9_]{2,30}$/.test(key)) throw new PgError('รหัสบทบาทใช้ a-z 0-9 _ 2–30 ตัว', '23514')
        if (db.roles.some((r) => r.key === key)) throw new PgError(`มีบทบาท ${key} แล้ว`, '23505')
        if (!b.name?.trim()) throw new PgError('ชื่อบทบาทห้ามว่าง', '23514')
        return fixRole({
          key,
          name: b.name.trim(),
          description: b.description ?? null,
          permissions: b.permissions ?? [],
          is_system: false,
          sort_order: b.sort_order ?? db.roles.length + 1,
          created_at: t,
          updated_at: t,
        })
      })
      db.roles.push(...created)
      persist()
      return written(request, created)
    }),
  ),
  http.patch(rest('roles'), ({ request }) =>
    guard(async () => {
      const denied = denyUnless(request, 'users.manage', 'ไม่มีสิทธิ์จัดการผู้ใช้และสิทธิ์')
      if (denied) return denied
      const patch = (await request.json()) as Partial<Role>
      const targets = new Set(filterRows(db.roles, new URL(request.url).searchParams))
      const t = new Date().toISOString()
      db.roles = db.roles.map((r) => (targets.has(r) ? fixRole({ ...r, ...patch, key: r.key, is_system: r.is_system, updated_at: t }) : r))
      persist()
      return written(request, db.roles.filter((r) => [...targets].some((x) => x.key === r.key)), 200)
    }),
  ),
  http.delete(rest('roles'), ({ request }) =>
    guard(async () => {
      const denied = denyUnless(request, 'users.manage', 'ไม่มีสิทธิ์จัดการผู้ใช้และสิทธิ์')
      if (denied) return denied
      const targets = filterRows(db.roles, new URL(request.url).searchParams)
      for (const r of targets) {
        if (r.is_system) throw new PgError('ลบบทบาทตั้งต้นไม่ได้')
        if (db.profiles.some((p) => p.role_key === r.key)) throw new PgError(`ยังมีผู้ใช้บทบาท ${r.name} อยู่ ย้ายผู้ใช้ก่อนลบ`)
      }
      db.roles = db.roles.filter((r) => !targets.includes(r))
      persist()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  // ── profiles (ผู้ใช้) ──
  http.get(rest('profiles'), ({ request }) => {
    if (!requireAuth(request)) return respondList(request, [])
    const me = emailOf(request)
    // เห็นทุกคนเมื่อมีสิทธิ์จัดการผู้ใช้ · ไม่งั้นเห็นแค่ตัวเอง (เหมือน RLS)
    const rows = accessOf(me).permissions.includes('users.manage') ? db.profiles : db.profiles.filter((p) => p.email === me)
    return respondList(request, rows)
  }),
  http.patch(rest('profiles'), ({ request }) =>
    guard(async () => {
      const denied = denyUnless(request, 'users.manage', 'ไม่มีสิทธิ์จัดการผู้ใช้และสิทธิ์')
      if (denied) return denied
      const patch = (await request.json()) as Partial<Profile>
      if (patch.role_key && !db.roles.some((r) => r.key === patch.role_key)) throw new PgError('ไม่พบบทบาทนี้', '23503')
      const targets = new Set(filterRows(db.profiles, new URL(request.url).searchParams))
      const t = new Date().toISOString()
      const next = db.profiles.map((p) => (targets.has(p) ? { ...p, ...patch, user_id: p.user_id, email: p.email, updated_at: t } : p))
      checkAdmins(next)
      db.profiles = next
      persist()
      return written(request, next.filter((p) => [...targets].some((x) => x.user_id === p.user_id)), 200)
    }),
  ),
]
