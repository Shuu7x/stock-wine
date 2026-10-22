import type { LookupValue } from '@/features/settings/api/settings.api'

type Origin = { country: string | null; region: string | null; wine_name: string; vintage: number | null }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** ลำดับจากข้อมูลหลัก (ค่าที่ไม่มีในข้อมูลหลักไปท้าย เรียงตามตัวอักษร) */
function orderOf(lookups: LookupValue[], category: 'country' | 'region') {
  const m = new Map<string, number>()
  for (const l of lookups) if (l.category === category && l.is_active) m.set(norm(l.value), l.sort_order)
  return (v: string | null) => (v ? (m.get(norm(v)) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER + 1)
}

/** เรียงตามลำดับประเทศ → แคว้น ที่ตั้งไว้ในการตั้งค่า แล้วตามชื่อไวน์ · ปี */
export function originComparator(lookups: LookupValue[]) {
  const country = orderOf(lookups, 'country')
  const region = orderOf(lookups, 'region')
  const text = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'th', { numeric: true })
  return (a: Origin, b: Origin) =>
    country(a.country) - country(b.country) ||
    text(a.country, b.country) ||
    region(a.region) - region(b.region) ||
    text(a.region, b.region) ||
    text(a.wine_name, b.wine_name) ||
    (a.vintage ?? 0) - (b.vintage ?? 0)
}
