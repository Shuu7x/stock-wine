import type { Borders, Cell, Fill, Workbook } from 'exceljs'

export type XlsxValue = string | number | Date | null | undefined

export type XlsxColumn<R> = {
  header: string
  value: (row: R) => XlsxValue
  /** ความกว้าง (ตัวอักษร) */
  width?: number
  /** รูปแบบตัวเลข Excel เช่น '#,##0.00' · วันที่ใช้ 'dd/mm/yyyy' ให้อัตโนมัติ */
  numFmt?: string
  align?: 'left' | 'center' | 'right'
  /** แถวรวมท้ายตาราง: รวมเฉพาะแถวที่ผ่านตัวกรองใน Excel (SUBTOTAL) */
  total?: 'sum'
  /** สีของเซลล์ตามค่า (ชื่อ token สี เช่น 'success-50') */
  tone?: (value: XlsxValue) => { fill?: string; font?: string } | undefined
}

/** อ่านสีจาก CSS token (index.css) แล้วแปลงเป็น ARGB ของ Excel — สีในไฟล์จึงตรงกับธีมเสมอ */
function argb(token: string, fallback: string): string
function argb(token: string): string | undefined
function argb(token: string, fallback?: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${token}`).trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(v)?.[1] ?? fallback ?? FALLBACK[token]
  return hex ? `FF${hex.toUpperCase()}` : undefined
}

// ค่าสำรองของสีสถานะ (ตรงกับ index.css) กรณีอ่านจาก CSS ไม่ได้ — ห้ามตกไปเป็นสีดำ
const FALLBACK: Record<string, string> = {
  'success-100': 'D5F2E0',
  'success-700': '176B3B',
  'info-50': 'EEF5FD',
  'info-600': '2864B4',
  'warning-100': 'FDE9C2',
  'warning-700': '965E04',
  'surface-3': 'F3EEEC',
  muted: '7D7174',
}

const solid = (color: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: color } })

/** หนึ่ง sheet ในไฟล์ */
export type XlsxSheet<R> = {
  /** ชื่อ sheet (Excel จำกัด 31 ตัว ห้าม : \ / ? * [ ]) */
  name: string
  title: string
  subtitle?: string
  columns: XlsxColumn<R>[]
  rows: R[]
}

/**
 * สร้างและดาวน์โหลดไฟล์ .xlsx (หลาย sheet ได้)
 * ทุก sheet: หัวคอลัมน์มีสี · ตัวกรองที่หัวคอลัมน์ · ตรึงแถวหัว · แถวรวมตามตัวกรอง
 */
export async function exportXlsx({ fileName, sheets }: { fileName: string; sheets: XlsxSheet<any>[] }) {
  // โหลด exceljs เฉพาะตอนกดส่งออก ไม่ให้หน้าเว็บหนัก
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Wine Cellar'
  wb.created = new Date()
  const used = new Set<string>()
  for (const sheet of sheets) {
    // ชื่อ sheet ต้องไม่ซ้ำและไม่มีอักขระต้องห้าม
    const base = sheet.name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet'
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} (${i})`
    used.add(name.toLowerCase())
    addSheet(wb, { ...sheet, name })
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function addSheet<R>(wb: Workbook, { name, title, subtitle, columns, rows }: XlsxSheet<R>) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  const brand = argb('brand-700', '7A1F3D')
  const line = argb('line-strong', 'D8CDCF')
  const stripe = argb('surface-2', 'FAF7F6')
  const thin = { style: 'thin' as const, color: { argb: line } }
  const border: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin }
  const n = columns.length

  // แถว 1–2: ชื่อรายงาน
  ws.mergeCells(1, 1, 1, n)
  Object.assign(ws.getCell(1, 1), {
    value: title,
    font: { bold: true, size: 15, color: { argb: argb('brand-900', '4A1427') } },
  })
  ws.mergeCells(2, 1, 2, n)
  Object.assign(ws.getCell(2, 1), {
    value: subtitle ?? '',
    font: { size: 10, color: { argb: argb('muted', '7D7174') } },
  })
  ws.getRow(1).height = 24

  // แถว 3: หัวคอลัมน์
  const header = ws.getRow(3)
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = solid(brand)
    cell.border = border
    cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left', wrapText: true }
    ws.getColumn(i + 1).width = c.width ?? Math.max(10, c.header.length + 4)
  })
  header.height = 22

  // ข้อมูล
  rows.forEach((r, ri) => {
    const row = ws.getRow(4 + ri)
    columns.forEach((c, ci) => {
      const v = c.value(r)
      const cell: Cell = row.getCell(ci + 1)
      cell.value = v ?? null
      cell.border = border
      cell.alignment = { vertical: 'middle', horizontal: c.align ?? 'left' }
      if (v instanceof Date) cell.numFmt = 'dd/mm/yyyy'
      else if (c.numFmt) cell.numFmt = c.numFmt
      const t = c.tone?.(v)
      const tFill = t?.fill ? argb(t.fill) : undefined
      const tFont = t?.font ? argb(t.font) : undefined
      if (tFill) cell.fill = solid(tFill)
      else if (ri % 2 === 1) cell.fill = solid(stripe)
      if (tFont) cell.font = { bold: true, color: { argb: tFont } }
    })
  })

  const first = 4
  const last = 3 + rows.length

  // แถวรวม (SUBTOTAL 9 = ผลรวมเฉพาะแถวที่มองเห็นหลังกรอง)
  if (columns.some((c) => c.total) && rows.length) {
    const tr = ws.getRow(last + 1)
    columns.forEach((c, ci) => {
      const cell = tr.getCell(ci + 1)
      const col = ws.getColumn(ci + 1).letter
      if (ci === 0) cell.value = 'รวม (ตามตัวกรอง)'
      if (c.total === 'sum') {
        cell.value = { formula: `SUBTOTAL(9,${col}${first}:${col}${last})` }
        cell.numFmt = c.numFmt ?? '#,##0'
        cell.alignment = { horizontal: 'right' }
      }
      cell.font = { bold: true, color: { argb: argb('brand-900', '4A1427') } }
      cell.fill = solid(argb('brand-100', 'F5E1E6'))
      cell.border = border
    })
  }

  // ตัวกรองที่หัวคอลัมน์
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, last), column: n } }
}
