import type { VatMode } from '@/lib/database.types'

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * คำนวณ VAT ของหนึ่งบรรทัด — ตรงกับ public.post_sale (ปัดทีละบรรทัด 2 ตำแหน่ง)
 * included: ราคาที่กรอกรวม VAT แล้ว ถอด VAT ออก · excluded: บวก VAT เพิ่ม
 */
export function lineVat(qty: number, unitPrice: number, hasVat: boolean, mode: VatMode, rate: number) {
  const gross = r2(qty * unitPrice)
  if (!hasVat) return { before: gross, vat: 0, total: gross }
  if (mode === 'included') {
    const before = r2((gross * 100) / (100 + rate))
    return { before, vat: r2(gross - before), total: gross }
  }
  const vat = r2((gross * rate) / 100)
  return { before: gross, vat, total: r2(gross + vat) }
}

export function sumVat(lines: Array<{ before: number; vat: number; total: number }>) {
  return lines.reduce(
    (s, l) => ({ before: r2(s.before + l.before), vat: r2(s.vat + l.vat), total: r2(s.total + l.total) }),
    { before: 0, vat: 0, total: 0 },
  )
}

export const VAT_MODE_LABEL: Record<VatMode, string> = {
  included: 'ราคารวม VAT แล้ว',
  excluded: 'ราคายังไม่รวม VAT',
}
