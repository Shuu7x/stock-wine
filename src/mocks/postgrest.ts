import { HttpResponse } from 'msw/http'
import { MOCK_USER, PgError } from '@/mocks/db'
import { env } from '@/lib/env'

// helper เลียนแบบ PostgREST เท่าที่หน้าจอใช้: eq neq is in ilike gte lte · order · offset/limit · count

export const rest = (path: string) => `${env.VITE_SUPABASE_URL}/rest/v1/${path}`
export const auth = (path: string) => `${env.VITE_SUPABASE_URL}/auth/v1/${path}`

const RESERVED = new Set(['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'])

type Row = Record<string, unknown>

function parseList(v: string): string[] {
  return v
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
}

function matchOne(value: unknown, op: string, arg: string): boolean {
  const neg = op.startsWith('not.')
  if (neg) return !matchOne(value, op.slice(4), arg)
  const s = value == null ? null : String(value)
  switch (op) {
    case 'eq':
      return s === arg
    case 'neq':
      return s !== arg
    case 'gt':
      return s != null && (isNaN(+arg) ? s > arg : +s > +arg)
    case 'gte':
      return s != null && (isNaN(+arg) ? s >= arg : +s >= +arg)
    case 'lt':
      return s != null && (isNaN(+arg) ? s < arg : +s < +arg)
    case 'lte':
      return s != null && (isNaN(+arg) ? s <= arg : +s <= +arg)
    case 'is':
      return arg === 'null' ? value == null : String(value) === arg
    case 'in':
      return s != null && parseList(arg).includes(s)
    case 'ilike': {
      const re = new RegExp('^' + arg.replace(/[.+?^${}()|[\]\]/g, '\$&').replace(/[*%]/g, '.*') + '$', 'i')
      return s != null && re.test(s)
    }
    default:
      return true
  }
}

export function filterRows<T extends Row>(rows: T[], q: URLSearchParams): T[] {
  const filters: Array<[string, string, string]> = []
  q.forEach((v, k) => {
    if (RESERVED.has(k)) return
    const m = v.match(/^((?:not\.)?[a-z]+)\.(.*)$/)
    if (m) filters.push([k, m[1], m[2]])
  })
  return rows.filter((r) => filters.every(([k, op, arg]) => matchOne(r[k], op, arg)))
}

export function sortRows<T extends Row>(rows: T[], q: URLSearchParams): T[] {
  const order = q.get('order')
  if (!order) return rows
  const specs = order.split(',').map((s) => {
    const [col, dir = 'asc', nulls] = s.split('.')
    return { col, desc: dir === 'desc', nullsFirst: nulls === 'nullsfirst' }
  })
  return [...rows].sort((a, b) => {
    for (const { col, desc, nullsFirst } of specs) {
      const av = a[col]
      const bv = b[col]
      if (av == bv) continue
      if (av == null) return nullsFirst ? -1 : 1
      if (bv == null) return nullsFirst ? 1 : -1
      const c =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'th')
      if (c !== 0) return desc ? -c : c
    }
    return 0
  })
}

export function respondList<T extends Row>(request: Request, rows: T[]) {
  const q = new URL(request.url).searchParams
  const sorted = sortRows(filterRows(rows, q), q)
  const offset = Number(q.get('offset') ?? 0)
  const limit = Number(q.get('limit') ?? sorted.length)
  const page = sorted.slice(offset, offset + limit)
  const wantsObject = request.headers.get('accept')?.includes('vnd.pgrst.object')
  if (wantsObject) {
    if (page.length !== 1) return pgError('JSON object requested, multiple (or no) rows returned', 406, 'PGRST116')
    return HttpResponse.json(page[0])
  }
  const end = page.length ? offset + page.length - 1 : offset
  return HttpResponse.json(page, {
    headers: { 'Content-Range': `${page.length ? offset : '*'}-${end}/${sorted.length}` },
  })
}

export function respondMaybeObject(request: Request, data: unknown) {
  const wantsObject = request.headers.get('accept')?.includes('vnd.pgrst.object')
  if (Array.isArray(data) && wantsObject) return HttpResponse.json(data[0] ?? null)
  return HttpResponse.json(data as never)
}

export function pgError(message: string, status = 400, code = 'P0001') {
  return HttpResponse.json({ code, message, details: null, hint: null }, { status })
}

export function requireAuth(request: Request) {
  const h = request.headers.get('authorization') ?? ''
  return h.startsWith('Bearer mock-access-')
}

export function emailOf(request: Request) {
  const t = request.headers.get('authorization')?.replace('Bearer mock-access-', '')
  try {
    return t ? atob(t) : MOCK_USER.email
  } catch {
    return MOCK_USER.email
  }
}

/** แนบรายการลูกเมื่อ select ขอ embed เช่น select=*,receipt_lines(*) */
export function withLines<T extends { id: string }, L>(
  request: Request,
  docs: T[],
  embed: string,
  lines: L[],
  fk: keyof L,
) {
  const select = new URL(request.url).searchParams.get('select') ?? ''
  if (!select.includes(`${embed}(`)) return docs
  return docs.map((d) => ({ ...d, [embed]: lines.filter((l) => l[fk] === d.id) }))
}

/** handler ของ /rpc/<fn> — PgError กลายเป็น error แบบ PostgREST */
export function rpc<A>(fn: (request: Request, args: A) => unknown) {
  return async ({ request }: { request: Request }) => {
    if (!requireAuth(request)) return pgError('ต้อง login ก่อน', 401, '42501')
    try {
      const args = (await request.json()) as A
      return HttpResponse.json(fn(request, args) as never)
    } catch (e) {
      if (e instanceof PgError) return pgError(e.message, 400, e.code)
      throw e
    }
  }
}
