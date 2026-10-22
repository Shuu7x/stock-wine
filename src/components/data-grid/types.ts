import type { ReactNode } from 'react'

export type CellValue = string | number | null

export type ColumnType = 'text' | 'number' | 'date' | 'select'

/** ตัวเลือกแบบละเอียดในช่องค้นหา เลือกแล้วแก้ทั้งแถวได้ (เช่น เลือกไวน์แล้วเติม country/rack/ปี ให้) */
export type Suggestion<R> = {
  key: string
  label: string
  detail?: string
  aside?: string
  apply: (row: R) => R
}

export type GridColumn<R> = {
  key: string
  title: string
  /** บรรทัดเล็กใต้หัวคอลัมน์ */
  subtitle?: string
  /** ช่วงปีของแถว — มี = พิมพ์ปีในตัวกรองเพื่อหาแถวที่ช่วงครอบคลุมปีนั้น (เช่น Maturity) */
  yearRange?: (row: R) => { from: number | null; to: number | null }
  /** ตรึงไว้ทางซ้ายเป็นค่าตั้งต้น (ผู้ใช้เปลี่ยนได้จากเมนูหัวคอลัมน์) */
  frozen?: boolean
  /** แทน subtitle ด้วยป้ายที่คำนวณจากแถวที่แสดงอยู่ (หลังกรอง) · คืน null = ใช้ subtitle ตามเดิม */
  headerTags?: (rows: R[]) => ReactNode
  width?: number
  type?: ColumnType
  align?: 'left' | 'right' | 'center'
  /** ค่าในเซลล์ (default: row[key]) */
  get?: (row: R) => CellValue
  /** เขียนค่ากลับเข้าแถว (default: { ...row, [key]: value }) */
  set?: (row: R, value: CellValue) => R
  /** แปลงข้อความที่พิมพ์/วาง เป็นค่า — คืน undefined = รูปแบบไม่ถูกต้อง */
  parse?: (text: string, row: R) => CellValue | undefined
  /** ข้อความที่แสดง ใช้ทั้งคัดลอกและตัวกรอง */
  format?: (value: CellValue, row: R) => string
  /** แสดงผลแบบกำหนดเอง (ไม่กระทบคัดลอก/กรอง) */
  render?: (row: R) => ReactNode
  readOnly?: boolean | ((row: R) => boolean)
  /** รายการให้เลือก (ข้อมูลที่ใช้บ่อย) — type 'select' บังคับต้องอยู่ในรายการ */
  options?: string[] | ((row: R) => string[])
  /** ค้นหาแบบละเอียด */
  suggest?: (query: string, row: R) => Suggestion<R>[]
  placeholder?: string
  filterable?: boolean
  /**
   * ค่าที่ใช้ในตัวกรองหัวคอลัมน์แทนข้อความที่แสดง เช่น Balance → "ใกล้หมด" / Maturity → "ดื่มได้"
   * ช่องค้นหารวมของตารางก็หาด้วยคำนี้ได้ด้วย
   */
  filterValue?: (row: R) => string
}

/** มุมมองการ์ดบนมือถือ (DataGrid สลับเองเมื่อจอแคบ) */
export type CardConfig<R> = {
  /** ชื่อหลักของการ์ด */
  title?: (row: R) => ReactNode
  /** บรรทัดรองใต้ชื่อ */
  subtitle?: (row: R) => ReactNode
  /** คอลัมน์ที่แสดงบนการ์ด (key) — ค่าว่างไม่แสดง */
  fields?: string[]
  /** แถวป้ายใต้ชื่อ เช่น ประเภท · ขนาด · ประเทศ */
  badges?: (row: R) => ReactNode
  /** ช่องที่กว้างเต็มการ์ด (ไม่ตัดข้อความ) เช่น Rate ที่มีหลายคะแนน */
  wide?: string[]
  /** มุมขวาของการ์ด เช่น ยอดคงเหลือ / ยอดเงิน */
  aside?: (row: R) => ReactNode
  /** ปุ่ม/ลิงก์เพิ่มเติมบนแผ่นแก้ไข */
  actions?: (row: R) => ReactNode
  /** เรียกรายการ เช่น "ไวน์" "รายการขาย" */
  noun?: string
  /** แถวว่าง (ซ่อนในมุมมองการ์ด) — ไม่ส่ง = เดาจากคอลัมน์ */
  isBlank?: (row: R) => boolean
}

export type CellPos = { r: number; c: number }

export type Selection = { anchor: CellPos; focus: CellPos }

export type SortDir = 'asc' | 'desc'
/** เรียงหลายคอลัมน์ — ตัวแรกสำคัญสุด ถ้าเท่ากันค่อยดูตัวถัดไป */
export type SortState = { key: string; dir: SortDir }[]

/** ค่า filter ต่อคอลัมน์ = ชุดข้อความที่ยอมให้แสดง */
export type FilterState = Record<string, string[]>
