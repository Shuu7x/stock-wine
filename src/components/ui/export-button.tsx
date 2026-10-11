import { FileSpreadsheet } from 'lucide-react'
import { Button } from './button'

/** ปุ่ม "ส่งออก Excel" — หน้าตาเดียวกันทุกหน้า */
export function ExportButton({
  onClick,
  loading,
  disabled,
  size = 'md',
  className,
  label = 'ส่งออก Excel',
}: {
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  label?: string
}) {
  return (
    <Button variant="excel" size={size} className={className} onClick={onClick} loading={loading} disabled={disabled}>
      {!loading && <FileSpreadsheet className="size-4" />}
      {label}
    </Button>
  )
}
