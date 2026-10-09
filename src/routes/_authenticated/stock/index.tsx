import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StockPage } from '@/features/stock/components/StockPage'

export const Route = createFileRoute('/_authenticated/stock/')({
  // store = 'all' หรือรหัสคลัง (คลังเพิ่มได้ในหน้าตั้งค่า)
  validateSearch: z.object({ store: z.string().max(12).default('all').catch('all') }),
  component: StockRoute,
})

function StockRoute() {
  const { store } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <StockPage tab={store} onTabChange={(t) => navigate({ search: { store: t } })} />
}
