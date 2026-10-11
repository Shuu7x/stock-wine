import { http, HttpResponse } from 'msw'
import { env } from '@/lib/env'
import { requireAuth } from '@/mocks/postgrest'

// เลียนแบบ Supabase Storage (bucket ส่วนตัว): อัปโหลด / ดาวน์โหลด
const FILES_KEY = 'stock-wine:mock-files:v1'
const object = (rest: string) => `${env.VITE_SUPABASE_URL}/storage/v1/object/${rest}`

function readAll(): Record<string, { type: string; data: string }> {
  try {
    return JSON.parse(localStorage.getItem(FILES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })

export const storageHandlers = [
  http.post(object(':bucket/*'), async ({ request, params }) => {
    if (!requireAuth(request)) return HttpResponse.json({ message: 'ต้อง login ก่อน' }, { status: 401 })
    const key = `${params.bucket}/${params[0]}`
    const blob = await request.blob()
    const all = readAll()
    all[key] = { type: request.headers.get('content-type') ?? blob.type, data: await toDataUrl(blob) }
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify(all))
    } catch {
      return HttpResponse.json({ message: 'พื้นที่เก็บไฟล์ทดลองเต็ม' }, { status: 413 })
    }
    return HttpResponse.json({ Key: key, Id: crypto.randomUUID() })
  }),
  http.get(object(':bucket/*'), async ({ request, params }) => {
    if (!requireAuth(request)) return HttpResponse.json({ message: 'ต้อง login ก่อน' }, { status: 401 })
    const f = readAll()[`${params.bucket}/${params[0]}`]
    if (!f) return HttpResponse.json({ message: 'Object not found' }, { status: 404 })
    const blob = await (await fetch(f.data)).blob()
    return new HttpResponse(blob, { headers: { 'content-type': f.type } })
  }),
]
