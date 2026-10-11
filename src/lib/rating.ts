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


/** นับคะแนนตามตัวย่อนักวิจารณ์ เช่น [["RP", 18], ["WS", 3]] — มากไปน้อย */
export function ratingCounts(values: Array<string | null | undefined>): Array<[string, number]> {
  const m = new Map<string, number>()
  for (const v of values) {
    const code = v ? /[A-Za-z]+$/.exec(v.trim())?.[0]?.toUpperCase() : undefined
    if (code) m.set(code, (m.get(code) ?? 0) + 1)
  }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
