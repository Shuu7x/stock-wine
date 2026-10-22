import { createFileRoute, redirect } from '@tanstack/react-router'
import { fromShortId } from '@/components/ui/qr-code'

// ลิงก์สั้นจาก QR บนป้ายห้อยขวด: /i/<base64url> → หน้าสต็อกที่แสดงเฉพาะไวน์นั้น
export const Route = createFileRoute('/_authenticated/i/$code')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/stock', search: { store: 'all', focus: fromShortId(params.code) ?? params.code }, replace: true })
  },
})
