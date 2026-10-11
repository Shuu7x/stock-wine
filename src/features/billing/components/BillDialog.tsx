import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { useAppSettings } from '@/features/settings/api/settings.api'
import { storesOptions } from '@/features/stock/api/stock.api'
import { fmtMoney } from '@/lib/format'
import { billDocsOptions } from '../api/billing.api'
import { Bill, receiptHeightMm, type BillPaper } from './Bill'
import { Loading } from '@/components/ui/loading'

const MM = 96 / 25.4

/** ดูตัวอย่างและพิมพ์บิล (หนึ่งใบหรือหลายใบพร้อมกัน — ใบละหน้า) */
export function BillDialog({ billIds, onClose }: { billIds: string[] | null; onClose: () => void }) {
  const settings = useAppSettings()
  const stores = useQuery(storesOptions()).data ?? []
  const ids = billIds ?? []
  const docsQ = useQuery(billDocsOptions(ids, stores))
  const docs = docsQ.data ?? []
  const [paper, setPaper] = useState<BillPaper | null>(null)
  const current = paper ?? settings.bill_paper

  useEffect(() => {
    if (!billIds) setPaper(null)
  }, [billIds])

  // ย่อตัวอย่างให้พอดีกล่อง
  const boxRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setZoom(Math.min(1, (el.clientWidth - 24) / ((current === 'a4' ? 210 : 80) * MM)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [current, docs.length])

  // ขนาดหน้ากระดาษตอนพิมพ์ (ทับค่า A4 ของป้าย QR) · ม้วน 80 มม. ใช้ความสูงของใบที่ยาวที่สุด
  const pageCss = docs.length
    ? current === 'a4'
      ? '@media print { @page { size: A4; margin: 0 } }'
      : `@media print { @page { size: 80mm ${Math.max(...docs.map(receiptHeightMm))}mm; margin: 0 } }`
    : ''

  const single = docs.length === 1 ? docs[0] : null
  const total = docs.reduce((s, d) => s + d.total, 0)


  return (
    <>
      <Dialog
        open={!!billIds}
        onClose={onClose}
        size="lg"
        title={single ? `บิล ${single.doc_no}` : `พิมพ์บิล ${ids.length} ใบ`}
        description={
          docs.length > 1
            ? `รวม ${fmtMoney(total)} บาท · พิมพ์ใบละหน้า · เลือก “บันทึกเป็น PDF” เพื่อส่งให้ลูกค้าทางออนไลน์ได้`
            : 'ตรวจตัวอย่างแล้วกดพิมพ์ · เลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์เพื่อส่งให้ลูกค้าทางออนไลน์ได้'
        }
        footer={
          <>
            <Segmented
              className="!mx-0 mr-auto !px-0"
              value={current}
              onChange={setPaper}
              items={[
                { value: 'a4', label: 'A4' },
                { value: '80mm', label: 'ใบเสร็จม้วน 80 มม.' },
              ]}
            />
            <Button onClick={onClose}>ปิด</Button>
            <Button variant="primary" disabled={!docs.length} onClick={() => window.print()}>
              <Printer className="size-4" /> พิมพ์{docs.length > 1 ? ` ${docs.length} ใบ` : 'บิล'}
            </Button>
          </>
        }
      >
        <div ref={boxRef} className="flex flex-col items-center gap-4 rounded-lg bg-surface-3 p-3">
          {!docs.length ? (
            <Loading className="py-16" label="กำลังเตรียมบิล…" />
          ) : (
            docs.map((d) => (
              <div key={d.id} className="shadow-lg" style={{ zoom }}>
                <Bill doc={d} shop={settings} paper={current} />
              </div>
            ))
          )}
        </div>

        {docs.length > 0 &&
          createPortal(
            <div className="print-root">
              <style>{pageCss}</style>
              {docs.map((d) => (
                <Bill key={d.id} doc={d} shop={settings} paper={current} />
              ))}
            </div>,
            document.body,
          )}
      </Dialog>

    </>
  )
}
