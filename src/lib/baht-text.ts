const DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** จำนวนเต็ม 0–999,999 เป็นคำอ่าน (ไม่มีคำว่า "ล้าน") */
function under1m(n: number): string {
  const s = String(n)
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const d = +s[i]
    const pos = s.length - 1 - i // 0 = หลักหน่วย
    if (d === 0) continue
    if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด'
    else if (pos === 1 && d === 2) out += 'ยี่'
    else if (pos === 1 && d === 1) out += ''
    else out += DIGITS[d]
    out += UNITS[pos]
  }
  return out
}

/** จำนวนเต็มใดๆ เป็นคำอ่านภาษาไทย (รองรับหลักล้านซ้อน) */
function intText(n: number): string {
  if (n === 0) return 'ศูนย์'
  const parts: string[] = []
  while (n > 0) {
    parts.unshift(under1m(n % 1_000_000))
    n = Math.floor(n / 1_000_000)
  }
  // ระหว่างแต่ละกลุ่มหกหลักคั่นด้วย "ล้าน"; กลุ่มล่างที่เป็น 1 อ่าน "เอ็ด" เฉพาะเมื่อมีกลุ่มข้างบน
  return parts
    .map((p, i) => (i > 0 && p === 'หนึ่ง' ? 'เอ็ด' : p))
    .join('ล้าน')
    .replace(/^ล้าน+/, '')
}

/** จำนวนเงินเป็นตัวอักษรภาษาไทย เช่น 12,000.50 → "หนึ่งหมื่นสองพันบาทห้าสิบสตางค์" */
export function bahtText(amount: number): string {
  const satangTotal = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(satangTotal / 100)
  const satang = satangTotal % 100
  const prefix = amount < 0 ? 'ลบ' : ''
  if (satang === 0) return `${prefix}${intText(baht)}บาทถ้วน`
  return `${prefix}${baht ? `${intText(baht)}บาท` : ''}${intText(satang)}สตางค์`
}
