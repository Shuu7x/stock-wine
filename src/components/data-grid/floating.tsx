import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/** กล่องลอยที่ยึดกับ element (portal ไป body) พลิกขึ้นบนเมื่อพื้นที่ด้านล่างไม่พอ */
export function Floating({
  anchor,
  children,
  width,
  maxHeight = 320,
  align = 'start',
  className,
  keepFocus = false,
}: {
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
  width?: number
  maxHeight?: number
  align?: 'start' | 'end'
  className?: string
  /** กดในกล่องแล้วไม่แย่ง focus จาก input ที่เปิดอยู่ (ใช้กับ dropdown ของ editor) */
  keepFocus?: boolean
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    const update = () => {
      const el = anchor.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.min(width ?? Math.max(r.width, 220), vw - 16)
      let left = align === 'end' ? r.right - w : r.left
      left = Math.max(8, Math.min(left, vw - w - 8))
      const below = vh - r.bottom - 8
      const above = r.top - 8
      const placeAbove = below < Math.min(maxHeight, 200) && above > below
      const h = Math.min(maxHeight, placeAbove ? above : below)
      setStyle({
        position: 'fixed',
        left,
        width: w,
        maxHeight: h,
        ...(placeAbove ? { bottom: vh - r.top + 2 } : { top: r.bottom + 2 }),
        zIndex: 60,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, width, maxHeight, align])

  return createPortal(
    <div
      data-floating=""
      style={style}
      className={className}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
    >
      {children}
    </div>,
    document.body,
  )
}
