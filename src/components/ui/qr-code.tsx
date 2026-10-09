import QRCode from 'qrcode'
import { useMemo } from 'react'

/** QR เป็น SVG (path เดียว) คมทุกขนาดตอนพิมพ์ · margin = ขอบขาวรอบ QR (หน่วย module) */
export function QrCode({
  value,
  margin = 2,
  className,
  title,
}: {
  value: string
  margin?: number
  className?: string
  title?: string
}) {
  const { d, n } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const size = qr.modules.size
    const data = qr.modules.data
    let path = ''
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`
      }
    }
    return { d: path, n: size }
  }, [value])

  return (
    <svg
      viewBox={`${-margin} ${-margin} ${n + margin * 2} ${n + margin * 2}`}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={title ?? 'QR code'}
    >
      <rect x={-margin} y={-margin} width={n + margin * 2} height={n + margin * 2} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}

/**
 * ลิงก์ที่ฝังใน QR ของไวน์แต่ละรายการ (สแกนแล้วเปิดหน้าไวน์ในระบบ)
 * ย่อ uuid (36 ตัว) เป็น base64url 22 ตัว ลิงก์สั้นลง QR หยาบลง สแกนง่ายบนป้ายเล็ก
 */
export function itemUrl(id: string) {
  return `${window.location.origin}/i/${shortId(id)}`
}

export function shortId(uuid: string): string {
  const hex = uuid.replace(/-/g, '')
  let bin = ''
  for (let i = 0; i < 32; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** แปลงกลับเป็น uuid (รูปแบบไม่ถูกต้อง = null) */
export function fromShortId(code: string): string | null {
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    if (bin.length !== 16) return null
    const hex = [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch {
    return null
  }
}
