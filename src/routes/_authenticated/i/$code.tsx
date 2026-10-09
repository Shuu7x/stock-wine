import { createFileRoute, redirect } from '@tanstack/react-router'
import { fromShortId } from '@/components/ui/qr-code'

// ลิงก์สั้นจาก QR บนป้ายห้อยขวด: /i/<base64url> → /item/<uuid>
export const Route = createFileRoute('/_authenticated/i/$code')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/item/$id', params: { id: fromShortId(params.code) ?? params.code }, replace: true })
  },
})
