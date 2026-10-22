/**
 * อ่านไฟล์ตาราง (Excel .xlsx · CSV · TSV · ข้อความ) เป็นตาราง string[][]
 * แล้วจับคู่หัวคอลัมน์กับคอลัมน์ของหน้า (ชื่อไทย/อังกฤษ) → แถวข้อมูล
 */
import type { GridColumn } from '@/components/data-grid/types'
import { parseText, setValue } from '@/components/data-grid/utils'

export const IMPORT_ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.txt'

export async function readTableFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls')) throw new Error('ไฟล์ .xls แบบเก่ายังไม่รองรับ — บันทึกเป็น .xlsx หรือ .csv ก่อน')
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(file)
  return readDelimited(await decodeText(file))
}

async function readXlsx(file: File): Promise<string[][]> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  // แผ่นแรกที่มีข้อมูล
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0)
  if (!ws) return []
  const out: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = []
    for (let c = 1; c <= ws.columnCount; c++) cells.push(row.getCell(c).text?.trim() ?? '')
    out.push(cells)
  })
  return out
}

/** CSV จาก Excel ภาษาไทยมักเป็น Windows-874 — ถ้าอ่านแบบ UTF-8 แล้วเพี้ยนให้ลองอีกแบบ */
async function decodeText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  try {
    return new TextDecoder('windows-874').decode(buf)
  } catch {
    return utf8
  }
}

/** แยกคอลัมน์ด้วย tab / comma / semicolon (เดาจากบรรทัดแรก) · รองรับค่าที่ครอบด้วย "…" */
function readDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = (['\t', ',', ';'] as const).map((d) => [d, first.split(d).length - 1] as const)
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) row.push(cell.trim()), (cell = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) row.push(cell.trim()), rows.push(row)
  return rows.filter((r) => r.some((c) => c !== ''))
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_./()·:-]+/g, '')

/** ชื่อหัวคอลัมน์อื่นที่ใช้กันบ่อย (นอกจาก title / subtitle / key) */
const ALIASES: Record<string, string[]> = {
  wine_name: ['wine', 'name', 'winename', 'ชื่อไวน์', 'ชื่อ', 'ไวน์'],
  vintage: ['year', 'vintage', 'ปี', 'ปีไวน์'],
  country: ['country', 'ประเทศ'],
  rating: ['rate', 'rating', 'score', 'คะแนน'],
  bottle_size: ['size', 'bottlesize', 'ขนาด', 'ขนาดขวด'],
  wine_type: ['type', 'winetype', 'ประเภท', 'ประเภทไวน์', 'ชนิด'],
  region: ['region', 'appellation', 'แคว้น', 'ภูมิภาค', 'เขต'],
  maturity: ['maturity', 'drink', 'ช่วงดื่ม', 'ปีที่ดื่มได้'],
  price_per_bottle: ['price', 'pricebtl', 'priceperbottle', 'ราคา', 'ราคาขวด', 'ราคาต่อขวด', 'ต้นทุน'],
  store_id: ['store', 'คลัง', 'ห้อง'],
  rack: ['rack', 'racks', 'wineracks', 'ชั้น', 'ชั้นวาง'],
  qty: ['qty', 'quantity', 'จำนวน', 'จำนวนรับ', 'ขวด', 'bottles'],
  remark: ['remark', 'note', 'หมายเหตุ'],
  supplier: ['supplier', 'ผู้ขาย', 'ซื้อจากใคร', 'ซื้อจาก'],
}

function matchColumn<R>(header: string, columns: GridColumn<R>[]): GridColumn<R> | undefined {
  const h = norm(header)
  if (!h) return undefined
  return columns.find((c) => {
    const names = [c.key, c.title, c.subtitle ?? '', ...(ALIASES[c.key] ?? [])].map(norm).filter(Boolean)
    return names.includes(h)
  })
}

export type ImportResult<R> = {
  rows: R[]
  /** หัวคอลัมน์ในไฟล์ → คอลัมน์ที่จับคู่ได้ (ไม่มีหัวตาราง = เรียงตามลำดับคอลัมน์) */
  mapped: string[]
  /** ค่าที่อ่านไม่ได้ (รูปแบบผิด) */
  invalid: number
}

/** แปลงตารางจากไฟล์เป็นแถว: มีหัวตาราง = จับคู่ตามชื่อ · ไม่มี = เรียงตามคอลัมน์ที่แก้ได้ของหน้า */
export function tableToRows<R>(matrix: string[][], columns: GridColumn<R>[], newRow: () => R): ImportResult<R> {
  // ข้ามคอลัมน์ที่คำนวณเอง (สถานะ · คงเหลือ)
  const editable = columns.filter((c) => c.readOnly !== true && !(c.get && !c.set))
  const head = matrix[0] ?? []
  const byHeader = head.map((h) => matchColumn(h, editable))
  const hasHeader = byHeader.filter(Boolean).length >= 2
  const map = hasHeader ? byHeader : editable.slice(0, head.length)
  const body = hasHeader ? matrix.slice(1) : matrix
  let invalid = 0
  const rows = body.map((cells) => {
    let row = newRow()
    cells.forEach((text, i) => {
      const col = map[i]
      if (!col || !text.trim()) return
      const v = parseText(col, text, row)
      if (v === undefined) invalid++
      else row = setValue(col, row, v)
    })
    return row
  })
  return {
    rows,
    mapped: hasHeader ? head.flatMap((h, i) => (byHeader[i] ? [`${h} → ${byHeader[i]!.title}`] : [])) : map.flatMap((c) => (c ? [c.title] : [])),
    invalid,
  }
}
