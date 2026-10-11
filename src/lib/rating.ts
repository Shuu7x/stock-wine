/**
 * คะแนนไวน์ (Rate) เก็บเป็นข้อความ เช่น "100RP, 98WS, 88RS"
 * รูปแบบหนึ่งค่า = ตัวเลข (มีทศนิยม / + ได้) ตามด้วยตัวย่อนักวิจารณ์ 1–5 ตัวอักษร
 */
const TOKEN = /(\d{1,3}(?:\.\d)?\+?)\s*([A-Za-z]{1,5})/g

/** ข้อความที่พิมพ์ → ค่ามาตรฐาน · ว่าง = null · รูปแบบผิด = undefined */
export function parseRating(text: string): string | null | undefined {
  const s = text.trim()
  if (!s) return null
  const parts: string[] = []
  let rest = s
  for (const m of s.matchAll(TOKEN)) {
    parts.push(`${m[1]}${m[2].toUpperCase()}`)
    rest = rest.replace(m[0], '')
  }
  // เหลือแต่ตัวคั่น (, ; / เว้นวรรค) = ถูกต้อง
  if (!parts.length || /[^\s,;/|]/.test(rest)) return undefined
  return parts.join(', ')
}

/** แยกเป็นคะแนนทีละค่า (ไว้แสดงเป็นป้ายเล็กๆ) */
export function ratingParts(rating: string | null | undefined): string[] {
  return rating ? rating.split(/\s*,\s*/).filter(Boolean) : []
}
