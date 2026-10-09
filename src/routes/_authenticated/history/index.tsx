import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { HISTORY_TABS, HistoryPage } from '@/features/history/components/HistoryPage'

export const Route = createFileRoute('/_authenticated/history/')({
  validateSearch: z.object({
    tab: z.enum(HISTORY_TABS).default('receipts').catch('receipts'),
    page: z.number().int().min(1).default(1).catch(1),
    pageSize: z.number().int().min(1).max(100).default(20).catch(20),
  }),
  component: HistoryRoute,
})

function HistoryRoute() {
  const { tab, page, pageSize } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <HistoryPage tab={tab} page={page} pageSize={pageSize} onChange={(next) => navigate({ search: (s) => ({ ...s, ...next }) })} />
}
