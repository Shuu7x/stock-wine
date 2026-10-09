import { createFileRoute } from '@tanstack/react-router'
import { ItemPage } from '@/features/stock/components/ItemPage'

// ปลายทางของ QR บนป้ายห้อยขวด — ยังไม่ login จะถูกพาไป login แล้วกลับมาหน้านี้
export const Route = createFileRoute('/_authenticated/item/$id')({
  component: function Page() {
    const { id } = Route.useParams()
    return <ItemPage id={id} />
  },
})
