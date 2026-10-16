/**
 * คะแนนไวน์ (Rate) — ใส่ได้หลายค่า เช่น "100RP, 98WS, 95JS"
 * หนึ่งค่า = ตัวเลข (มีทศนิยม / + ได้) ตามด้วยตัวย่อนักวิจารณ์ 1–5 ตัวอักษร
 */
const TOKEN = /(\d{1,3}(?:\.\d)?\+?)\s*([A-Za-z]{1,5})/g

/** ข้อความที่พิมพ์ → ค่ามาตรฐาน "100RP, 98WS" · ว่าง = null · รูปแบบผิด = undefined */
export function parseRating(text: string): string | null | undefined {
  const s = text.trim()
  if (!s) return null
  const parts: string[] = []
  const codes = new Set<string>()
  let rest = s
  for (const m of s.matchAll(TOKEN)) {
    const code = m[2].toUpperCase()
    // นักวิจารณ์เดียวกันซ้ำ = ใช้ค่าแรก
    if (!codes.has(code)) parts.push(`${m[1]}${code}`), codes.add(code)
    rest = rest.replace(m[0], '')
  }
  // เหลือแต่ตัวคั่น (, ; / | เว้นวรรค) = ถูกต้อง
  if (!parts.length || /[^\s,;/|]/.test(rest)) return undefined
  return parts.join(', ')
}

/** แยกเป็นคะแนนทีละค่า: "100RP, 98WS" → ["100RP", "98WS"] */
export function ratingParts(rating: string | null | undefined): string[] {
  return rating ? rating.split(/\s*,\s*/).filter(Boolean) : []
}

/** นับคะแนนตามตัวย่อนักวิจารณ์ เช่น [["RP", 18], ["WS", 3]] — มากไปน้อย (ไวน์ที่มีหลายค่านับทุกค่า) */
export function ratingCounts(values: Array<string | null | undefined>): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const v of values)
    for (const p of ratingParts(v)) {
      const code = /[A-Za-z]+$/.exec(p)?.[0]?.toUpperCase()
      if (code) m.set(code, (m.get(code) ?? 0) + 1)
    }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
