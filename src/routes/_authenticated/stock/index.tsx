import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StockPage } from '@/features/stock/components/StockPage'

export const Route = createFileRoute('/_authenticated/stock/')({
  validateSearch: z.object({ store: z.enum(['all', 'SW1', 'SW2', 'BIG']).default('all').catch('all') }),
  component: StockRoute,
})

function StockRoute() {
  const { store } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <StockPage tab={store} onTabChange={(t) => navigate({ search: { store: t } })} />
}
