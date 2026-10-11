import { useIsFetching } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useId, useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

/**
 * แก้วไวน์โหลด: ไวน์ในแก้วกระเพื่อมและขึ้นลงช้าๆ (CSS ล้วน · ลดการเคลื่อนไหว = ภาพนิ่ง)
 * ใช้ id เฉพาะต่อชิ้น เพราะ clipPath ใน SVG อ้างด้วย id
 */
export function WineGlass({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 48 64" className={cn('wine-glass', className)} aria-hidden>
      <defs>
        <clipPath id={`bowl-${id}`}>
          <path d="M9 6h30c0 14-3 25-15 27C12 31 9 20 9 6z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#bowl-${id})`}>
        <g className="wine-glass__level">
          {/* คลื่นกว้าง 2 เท่า เลื่อนวนไม่สะดุด */}
          <path
            className="wine-glass__wave"
            d="M-48 20q6-3 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0V40H-48z"
            fill="var(--color-brand-600)"
          />
          <path
            className="wine-glass__wave wine-glass__wave--back"
            d="M-48 21q6 3 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0V40H-48z"
            fill="var(--color-brand-800)"
            opacity="0.55"
          />
        </g>
      </g>
      <path d="M9 6h30c0 14-3 25-15 27C12 31 9 20 9 6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 33v20M15 57h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 10c0 6 1 11 4 15" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** จุดกึ่งกลางของพื้นที่เนื้อหา (<main>) บนจอ — ไม่นับ sidebar/แถบเมนูมือถือ */
function useMainCenter(enabled: boolean) {
  const [c, setC] = useState<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    if (!enabled) return
    const main = document.querySelector('main')
    const update = () => {
      const r = main?.getBoundingClientRect()
      setC(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 })
    }
    update()
    const ro = new ResizeObserver(update)
    if (main) ro.observe(main)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [enabled])
  return c
}

/**
 * สถานะกำลังโหลด: แก้วไวน์ + ข้อความ
 * - ปกติ: อยู่กลางกล่องที่วางไว้ (เต็มความสูงกล่อง)
 * - screen: ข้อมูลหลักของหน้ายังไม่มา → แก้วไวน์อยู่กลางพื้นที่เนื้อหาบนจอ ไม่ว่ากล่องจะอยู่ตรงไหน
 */
export function Loading({
  label = 'กำลังโหลด…',
  className,
  size = 'md',
  screen,
}: {
  label?: ReactNode
  className?: string
  size?: 'sm' | 'md'
  screen?: boolean
}) {
  const center = useMainCenter(!!screen)
  if (screen) {
    return (
      <div role="status" aria-live="polite" className={cn('h-full min-h-24', className)}>
        <span className="sr-only">{label}</span>
        {center &&
          createPortal(
            <div
              aria-hidden
              className="pointer-events-none fixed z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-brand-700"
              style={{ left: center.x, top: center.y }}
            >
              <WineGlass className="h-12 w-9" />
              {label && <span className="text-sm whitespace-nowrap text-muted">{label}</span>}
            </div>,
            document.body,
          )}
      </div>
    )
  }
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-2 text-brand-700', size === 'md' ? 'h-full py-12' : 'py-4', className)}>
      <WineGlass className={size === 'md' ? 'h-12 w-9' : 'h-8 w-6'} />
      {label && <span className="text-sm text-muted">{label}</span>}
    </div>
  )
}

/** แถบโครงร่างแบบประกายเลื่อน (shimmer) ระหว่างรอข้อมูล */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block rounded-md', className)} />
}

/**
 * แถบโหลดบางๆ บนสุดของจอ: ขึ้นเมื่อกำลังเปลี่ยนหน้า หรือดึงข้อมูลเบื้องหลัง
 * หน่วง 250 มิลลิวินาทีก่อนแสดง โหลดเร็วๆ จะได้ไม่กะพริบ
 */
export function TopLoader() {
  const fetching = useIsFetching() > 0
  const routing = useRouterState({ select: (s) => s.status === 'pending' })
  const busy = fetching || routing
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!busy) {
      setShow(false)
      return
    }
    const t = window.setTimeout(() => setShow(true), 250)
    return () => clearTimeout(t)
  }, [busy])
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-300',
        show ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div className="top-loader__bar h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-gold-500 to-brand-600" />
    </div>
  )
}
