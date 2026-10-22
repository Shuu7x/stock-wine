import { useLocation } from '@tanstack/react-router'
import { CircleHelp } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { autoTour, hasTour, startTour } from './tour'
import { tourKey } from './tours'

/** ปุ่ม ? ข้างชื่อหน้า: กดเพื่อดูวิธีใช้หน้านี้ · เข้าหน้าครั้งแรกเปิดให้เอง */
export function TourButton({ className }: { className?: string }) {
  const { pathname } = useLocation()
  const key = tourKey(pathname)
  useEffect(() => autoTour(key), [key])
  if (!hasTour(key)) return null
  return (
    <button
      type="button"
      data-tour="help"
      onClick={() => startTour(key)}
      title="วิธีใช้หน้านี้"
      aria-label="วิธีใช้หน้านี้"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-brand-50 hover:text-brand-700',
        className,
      )}
    >
      <CircleHelp className="size-5" />
    </button>
  )
}
