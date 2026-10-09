/** ตัวกรองรายการเอกสาร (หน้าประวัติ) — กรองฝั่ง server */
export type DocFilter = {
  status?: 'posted' | 'void'
  /** yyyy-mm-dd */
  from?: string
  /** yyyy-mm-dd (รวมวันนั้น) */
  to?: string
}

/**
 * ใส่เงื่อนไขกรองให้ query ของเอกสาร
 * timestamp = คอลัมน์วันที่เป็น timestamptz (แปลงช่วงวันตามเวลาท้องถิ่น) · ไม่ใช่ = คอลัมน์ date
 */
export function applyDocFilter<Q>(q: Q, dateCol: string, f: DocFilter, timestamp = false): Q {
  // builder ของ supabase-js ผูก type ชื่อคอลัมน์ไว้แน่น ใช้ชื่อคอลัมน์แบบไดนามิกจึงต้องผ่าน unknown
  let b = q as unknown as {
    eq: (c: string, v: string) => typeof b
    gte: (c: string, v: string) => typeof b
    lte: (c: string, v: string) => typeof b
  }
  if (f.status) b = b.eq('status', f.status)
  if (f.from) b = b.gte(dateCol, timestamp ? new Date(`${f.from}T00:00:00`).toISOString() : f.from)
  if (f.to) b = b.lte(dateCol, timestamp ? new Date(`${f.to}T23:59:59.999`).toISOString() : f.to)
  return b as unknown as Q
}
