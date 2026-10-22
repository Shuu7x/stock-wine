import type { CSSProperties, ReactNode } from 'react'
import type { AppSettings } from '@/features/settings/app-settings'
import { wineLabel } from '@/features/stock/columns'
import { bahtText } from '@/lib/baht-text'
import type { VatMode } from '@/lib/database.types'
import { fmtDate, fmtInt, fmtMoney } from '@/lib/format'

export type BillPaper = 'a4' | '80mm'

/** ข้อมูลที่บิลต้องใช้ (มาจากใบขาย หรือข้อมูลตัวอย่างในหน้าตั้งค่า) */
export type BillDoc = {
  doc_no: string
  sold_at: string
  customer: string | null
  customer_address?: string | null
  note: string | null
  status: 'posted' | 'void'
  vat_mode: VatMode
  vat_rate: number
  subtotal: number
  vat_amount: number
  total: number
  created_by_email: string | null
  /** อ้างอิง เช่น เลขใบขายที่รวมอยู่ในบิล */
  ref?: string | null
  lines: Array<{
    wine_name: string
    vintage: number | null
    /** รหัสคลังที่ตัดสต็อก */
    store_code: string
    qty: number
    unit_price: number
    has_vat: boolean
    line_total: number
  }>
}

type Shop = Pick<
  AppSettings,
  'shop_name' | 'shop_address' | 'shop_phone' | 'shop_tax_id' | 'bill_title' | 'bill_title_en' | 'bill_footer'
>

/** ความสูงกระดาษม้วน 80 มม. โดยประมาณ (มม.) ตามจำนวนรายการ */
export function receiptHeightMm(doc: BillDoc) {
  return Math.ceil(95 + doc.lines.length * 9 + (doc.note ? 6 : 0))
}

/** วันที่แบบ พ.ศ. dd/mm/yyyy */
function fmtDateBE(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${Number(y) + 543}`
}

/** รหัสพนักงาน = ชื่อหน้า @ ของอีเมลผู้บันทึก */
const staffCode = (email: string | null) => (email ? email.split('@')[0].toUpperCase() : '')

// บิลใช้สีดำล้วน พิมพ์เครื่องไหนก็ชัด
const INK = '#000'
const B = `0.3mm solid ${INK}`

function VoidStamp({ size }: { size: number }) {
  return (
    <div
      className="pointer-events-none absolute top-1/3 left-1/2 z-10 -translate-x-1/2 -rotate-[18deg] rounded-md border-[0.8mm] px-[4mm] font-bold tracking-widest"
      style={{ borderColor: '#c62f2f', color: '#c62f2f', fontSize: `${size}mm`, opacity: 0.55 }}
    >
      ยกเลิก
    </div>
  )
}

export function Bill({ doc, shop, paper }: { doc: BillDoc; shop: Shop; paper: BillPaper }) {
  const anyVat = doc.lines.some((l) => l.has_vat) && doc.vat_amount > 0
  return paper === '80mm' ? <Receipt80 doc={doc} shop={shop} anyVat={anyVat} /> : <BillA4 doc={doc} shop={shop} anyVat={anyVat} />
}

// ─── A4 (แบบใบส่งสินค้า) ───────────────────────────────────────────────────

/** คอลัมน์ตาราง: ลำดับ | รายละเอียด | สโตร์ | จำนวน | หน่วยละ | ส่วนลด | จำนวนเงิน */
const COLS = '12mm 1fr 17mm 22mm 23mm 19mm 27mm'

function Info({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex gap-[1.5mm]">
      <span className="shrink-0 font-semibold">{label} :</span>
      <span className="min-w-0 font-semibold">{children}</span>
    </div>
  )
}

function BillA4({ doc, shop, anyVat }: { doc: BillDoc; shop: Shop; anyVat: boolean }) {
  const page: CSSProperties = {
    width: '210mm',
    minHeight: '297mm',
    padding: '10mm',
    color: INK,
    fontFamily: 'var(--font-doc)',
    fontSize: '3.3mm',
    lineHeight: 1.4,
  }
  const totalQty = doc.lines.reduce((s, l) => s + l.qty, 0)
  const contact = [
    shop.shop_address.replace(/\s*\n\s*/g, ' '),
    shop.shop_phone && `โทร. ${shop.shop_phone}`,
    shop.shop_tax_id && `เลขประจำตัวผู้เสียภาษี ${shop.shop_tax_id}`,
  ]
    .filter(Boolean)
    .join(' ')
  const cell = 'px-[2mm] py-[1.2mm]'

  return (
    <div className="bill-sheet relative bg-white" style={page}>
      {doc.status === 'void' && <VoidStamp size={22} />}
      {/* กรอบทั้งหน้า */}
      <div className="flex flex-col" style={{ border: B, minHeight: '277mm' }}>
        {/* หัวบริษัท */}
        <div className="px-[5mm] pt-[3mm] text-center">
          <div className="font-bold" style={{ fontSize: '5mm' }}>
            {shop.shop_name || 'ชื่อบริษัท'}
          </div>
          {contact && <div style={{ fontSize: '2.8mm' }}>{contact}</div>}
        </div>
        <div className="mx-[5mm] mt-[2mm]" style={{ borderTop: B }} />

        {/* ชื่อเอกสาร */}
        <div className="py-[2.5mm] text-center leading-tight">
          <div className="font-bold" style={{ fontSize: '6mm' }}>
            {shop.bill_title || 'ใบส่งสินค้า'}
          </div>
          {shop.bill_title_en && (
            <div className="font-bold tracking-wide" style={{ fontSize: '4.6mm' }}>
              {shop.bill_title_en}
            </div>
          )}
        </div>

        {/* ลูกค้า | เลขที่เอกสาร */}
        <div className="flex gap-[18mm] px-[2mm] pb-[4mm]">
          <div className="flex-1 px-[2mm] py-[2mm]" style={{ border: B, minHeight: '30mm' }}>
            <Info label="ชื่อลูกค้า">{doc.customer}</Info>
            <div className="pl-[6mm]">
              <Info label="ที่อยู่">{doc.customer_address}</Info>
            </div>
          </div>
          <div className="flex w-[62mm] flex-col gap-[1.6mm] px-[2mm] py-[2mm]" style={{ border: B }}>
            <Info label="เลขที่">{doc.doc_no}</Info>
            <Info label="วันที่">{fmtDateBE(doc.sold_at)}</Info>
            <Info label="อ้างอิง">
              <span className="font-mono" style={{ fontSize: '2.9mm' }}>
                {doc.ref}
              </span>
            </Info>
            <Info label="รหัสพนักงาน">{staffCode(doc.created_by_email)}</Info>
          </div>
        </div>

        {/* ตารางรายการ: เส้นคอลัมน์ลากยาวถึงแถวยอดรวม */}
        <div className="grid text-center font-semibold" style={{ gridTemplateColumns: COLS, borderTop: B, borderBottom: B }}>
          {['ลำดับ', 'รายละเอียด', 'สโตร์', 'จำนวน(ขวด)', 'หน่วยละ', 'ส่วนลด(%)', 'จำนวนเงิน'].map((h, i) => (
            <div key={h} className={cell} style={{ borderLeft: i ? B : undefined }}>
              {h}
            </div>
          ))}
        </div>
        <div className="relative flex-1" style={{ minHeight: '70mm' }}>
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: COLS }} aria-hidden>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} style={{ borderLeft: i ? B : undefined }} />
            ))}
          </div>
          <div className="relative pt-[1mm]">
            {doc.lines.map((l, i) => (
              <div key={i} className="grid" style={{ gridTemplateColumns: COLS }}>
                <div className={`${cell} text-center`}>{i + 1}</div>
                <div className={cell}>
                  {wineLabel(l)}
                  {anyVat && !l.has_vat && <span style={{ fontSize: '2.7mm' }}> (ไม่มี VAT)</span>}
                </div>
                <div className={`${cell} text-center`} style={{ fontSize: '2.7mm' }}>
                  {l.store_code}
                </div>
                <div className={`${cell} text-center tabular-nums`}>{fmtInt(l.qty)}</div>
                <div className={`${cell} text-right tabular-nums`}>{fmtMoney2(l.unit_price)}</div>
                <div className={`${cell} text-center`} />
                <div className={`${cell} text-right tabular-nums`}>{fmtMoney2(l.line_total)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid font-semibold" style={{ gridTemplateColumns: COLS, borderTop: B, borderBottom: B }}>
          <div className={`${cell} col-span-3 text-center`}>ยอดรวมรายการ</div>
          <div className={`${cell} text-center tabular-nums`} style={{ borderLeft: B }}>
            {fmtInt(totalQty)} Btl.
          </div>
          <div className={cell} style={{ borderLeft: B }} />
          <div className={cell} style={{ borderLeft: B }} />
          <div className={cell} style={{ borderLeft: B }} />
        </div>

        {/* หมายเหตุ | ยอดเงิน */}
        <div className="flex items-start gap-[6mm] px-[2mm] pt-[3mm]">
          <div className="flex min-w-0 flex-1 flex-col gap-[3mm] pt-[3mm]">
            <div className="flex items-start gap-[3mm] pl-[10mm]">
              <span className="shrink-0 pt-[1mm] font-semibold">หมายเหตุ :</span>
              <div className="min-h-[15mm] flex-1 px-[2mm] py-[1mm]" style={{ border: B }}>
                {doc.note}
              </div>
            </div>
            {/* จำนวนเงินเป็นตัวอักษร */}
            <div className="px-[2mm] py-[1.5mm] text-center font-semibold" style={{ border: B, minHeight: '8mm' }}>
              ({bahtText(doc.total)})
            </div>
          </div>
          <div className="grid shrink-0 font-semibold" style={{ gridTemplateColumns: '38mm 38mm' }}>
            {[
              ['รวมราคาสินค้า', fmtMoney2(anyVat ? doc.subtotal : doc.total)],
              ['ส่วนลดเงินสด', ''],
              ['จำนวนภาษีมูลค่าเพิ่ม', anyVat ? fmtMoney2(doc.vat_amount) : ''],
              ['ราคารวมทั้งสิ้น', fmtMoney2(doc.total)],
            ].map(([label, v], i, arr) => (
              <div key={label} className="contents">
                <div className="px-[2mm] py-[1.5mm] text-right">{label}</div>
                <div
                  className="px-[2mm] py-[1.5mm] text-right tabular-nums"
                  style={{
                    border: B,
                    borderTop: i ? undefined : B,
                    borderBottom: i === arr.length - 1 ? `0.6mm double ${INK}` : B,
                  }}
                >
                  {v}
                </div>
              </div>
            ))}
            {anyVat && (
              <div className="col-span-2 pt-[1mm] text-right font-normal" style={{ fontSize: '2.6mm' }}>
                {doc.vat_mode === 'included' ? `ราคารวมภาษีมูลค่าเพิ่ม ${doc.vat_rate}% แล้ว` : `บวกภาษีมูลค่าเพิ่ม ${doc.vat_rate}%`}
              </div>
            )}
          </div>
        </div>

        {/* ลงชื่อ */}
        <div className="mt-auto grid grid-cols-3 gap-[10mm] px-[12mm] pt-[16mm] pb-[5mm] text-center font-semibold">
          {['ผู้รับสินค้า', 'ผู้ส่งสินค้า', 'ผู้จัดสินค้า'].map((t) => (
            <div key={t}>
              <div style={{ borderTop: B }} />
              <div className="mt-[1.5mm]" style={{ fontSize: '3.6mm' }}>
                {t}
              </div>
            </div>
          ))}
        </div>
        {shop.bill_footer && (
          <div className="pb-[3mm] text-center" style={{ fontSize: '2.8mm' }}>
            {shop.bill_footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** เงินแบบบัญชี: ทศนิยม 2 ตำแหน่งเสมอ */
const money2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMoney2 = (n: number) => money2.format(n)

// ─── ใบเสร็จม้วน 80 มม. ────────────────────────────────────────────────────

function Receipt80({ doc, shop, anyVat }: { doc: BillDoc; shop: Shop; anyVat: boolean }) {
  const dash = { borderTop: `0.3mm dashed ${INK}`, margin: '2.5mm 0' }
  const row = 'flex justify-between gap-[2mm]'
  return (
    <div
      className="bill-sheet relative bg-white"
      style={{ width: '80mm', minHeight: `${receiptHeightMm(doc)}mm`, padding: '5mm 4mm', color: INK, fontSize: '3mm', lineHeight: 1.45 }}
    >
      {doc.status === 'void' && <VoidStamp size={9} />}
      <div className="text-center">
        <div className="font-bold" style={{ fontSize: '4.4mm' }}>
          {shop.shop_name || 'ชื่อร้าน'}
        </div>
        {shop.shop_address && <div className="whitespace-pre-line">{shop.shop_address}</div>}
        {shop.shop_phone && <div>โทร {shop.shop_phone}</div>}
        {shop.shop_tax_id && <div>เลขผู้เสียภาษี {shop.shop_tax_id}</div>}
        <div className="mt-[2mm] font-bold" style={{ fontSize: '3.6mm' }}>
          {shop.bill_title || 'ใบส่งสินค้า'}
        </div>
      </div>
      <div style={dash} />
      <div className={row}>
        <span>เลขที่ {doc.doc_no}</span>
        <span>{fmtDate(doc.sold_at)}</span>
      </div>
      {doc.customer && <div>ลูกค้า: {doc.customer}</div>}
      {doc.customer_address && <div style={{ whiteSpace: 'pre-line' }}>ที่อยู่: {doc.customer_address}</div>}
      {doc.ref && <div style={{ fontSize: '2.6mm' }}>อ้างอิง: {doc.ref}</div>}
      <div style={dash} />
      {doc.lines.map((l, i) => (
        <div key={i} className="mb-[1.5mm]">
          <div>
            {wineLabel(l)}
            {anyVat && !l.has_vat && ' (ไม่มี VAT)'}
          </div>
          <div className={`${row} tabular-nums`}>
            <span>
              {l.qty} × {fmtMoney(l.unit_price)}
            </span>
            <span>{fmtMoney(l.line_total)}</span>
          </div>
        </div>
      ))}
      <div style={dash} />
      {anyVat && (
        <>
          <div className={`${row} tabular-nums`}>
            <span>ยอดก่อน VAT</span>
            <span>{fmtMoney(doc.subtotal)}</span>
          </div>
          <div className={`${row} tabular-nums`}>
            <span>VAT {doc.vat_rate}%</span>
            <span>{fmtMoney(doc.vat_amount)}</span>
          </div>
        </>
      )}
      <div className={`${row} font-bold tabular-nums`} style={{ fontSize: '3.8mm' }}>
        <span>รวมทั้งสิ้น</span>
        <span>{fmtMoney(doc.total)}</span>
      </div>
      <div className="text-right" style={{ fontSize: '2.6mm' }}>
        ({bahtText(doc.total)})
      </div>
      {doc.note && <div className="mt-[1.5mm]">หมายเหตุ: {doc.note}</div>}
      <div style={dash} />
      {shop.bill_footer && <div className="text-center">{shop.bill_footer}</div>}
    </div>
  )
}
