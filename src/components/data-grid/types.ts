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

export type CellPos = { r: number; c: number }

export type Selection = { anchor: CellPos; focus: CellPos }

export type SortState = { key: string; dir: 'asc' | 'desc' } | null

/** ค่า filter ต่อคอลัมน์ = ชุดข้อความที่ยอมให้แสดง */
export type FilterState = Record<string, string[]>
