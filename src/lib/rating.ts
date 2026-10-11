/**
 * คะแนนไวน์ (Rate) — ค่าเดียวต่อไวน์ เช่น "100RP" หรือ "98WS"
 * = ตัวเลข (มีทศนิยม / + ได้) ตามด้วยตัวย่อนักวิจารณ์ 1–5 ตัวอักษร
 */
const RATING = /^(\d{1,3}(?:\.\d)?\+?)\s*([A-Za-z]{1,5})$/

/** ข้อความที่พิมพ์ → ค่ามาตรฐาน · ว่าง = null · รูปแบบผิด = undefined */
export function parseRating(text: string): string | null | undefined {
  const s = text.trim()
  if (!s) return null
  const m = RATING.exec(s)
  return m ? `${m[1]}${m[2].toUpperCase()}` : undefined
}

