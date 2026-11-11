import { http, HttpResponse } from 'msw'
import { env } from '@/lib/env'
import { requireAuth } from '@/mocks/postgrest'

// เลียนแบบ Supabase Storage (bucket ส่วนตัว): อัปโหลด / ดาวน์โหลด
// เก็บไฟล์ใน IndexedDB ของเบราว์เซอร์ — localStorage จุได้ราว 5 MB (รวมข้อมูลทดลองทั้งหมด) แนบรูปบิลไม่กี่ใบก็เต็ม
const DB_NAME = 'stock-wine-mock-files'
const STORE = 'files'
/** ที่เก็บเดิม (localStorage) — ย้ายมา IndexedDB ครั้งแรกที่ใช้ */
const LEGACY_KEY = 'stock-wine:mock-files:v1'
const object = (rest: string) => `${env.VITE_SUPABASE_URL}/storage/v1/object/${rest}`

type Stored = { type: string; blob: Blob }

let opening: Promise<IDBDatabase> | null = null
function openDb() {
  opening ??= new Promise<IDBDatabase>((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  }).then(async (db) => {
    await migrateLegacy(db)
    return db
  })
  return opening
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

async function migrateLegacy(db: IDBDatabase) {
  let old: Record<string, { type: string; data: string }>
  try {
    old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null')
  } catch {
    old = {}
  }
  if (!old) return
  for (const [key, f] of Object.entries(old)) {
    const blob = await (await fetch(f.data)).blob()
    await tx(db, 'readwrite', (s) => s.put({ type: f.type, blob } satisfies Stored, key))
  }
  localStorage.removeItem(LEGACY_KEY)
}

export const storageHandlers = [
  http.post(object(':bucket/*'), async ({ request, params }) => {
    if (!requireAuth(request)) return HttpResponse.json({ message: 'ต้อง login ก่อน' }, { status: 401 })
    const key = `${params.bucket}/${params[0]}`
    // supabase-js ส่ง File/Blob เป็น multipart (ไฟล์อยู่ในฟอร์ม) · ส่ง ArrayBuffer เป็นไฟล์ตรงๆ
    const ct = request.headers.get('content-type') ?? ''
    let blob: Blob
    if (ct.startsWith('multipart/form-data')) {
      const file = [...(await request.formData()).values()].find((v): v is File => typeof v !== 'string')
      if (!file) return HttpResponse.json({ message: 'ไม่พบไฟล์ในคำขอ' }, { status: 400 })
      blob = file
    } else {
      blob = await request.blob()
    }
    try {
      const db = await openDb()
      await tx(db, 'readwrite', (s) => s.put({ type: blob.type || ct || 'application/octet-stream', blob } satisfies Stored, key))
    } catch {
      return HttpResponse.json({ message: 'พื้นที่เก็บไฟล์ทดลองในเบราว์เซอร์เต็ม' }, { status: 413 })
    }
    return HttpResponse.json({ Key: key, Id: crypto.randomUUID() })
  }),
  http.get(object(':bucket/*'), async ({ request, params }) => {
    if (!requireAuth(request)) return HttpResponse.json({ message: 'ต้อง login ก่อน' }, { status: 401 })
    const db = await openDb()
    const f = await tx<Stored | undefined>(db, 'readonly', (s) => s.get(`${params.bucket}/${params[0]}`))
    if (!f) return HttpResponse.json({ message: 'Object not found' }, { status: 404 })
    return new HttpResponse(f.blob, { headers: { 'content-type': f.type } })
  }),
]
