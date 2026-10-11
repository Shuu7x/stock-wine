import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { HISTORY_TABS, HISTORY_VIEWS, HistoryPage } from '@/features/history/components/HistoryPage'

export const Route = createFileRoute('/_authenticated/history/')({
  validateSearch: z.object({
    tab: z.enum(HISTORY_TABS).default('logs').catch('logs'),
    view: z.enum(HISTORY_VIEWS).default('docs').catch('docs'),
    page: z.number().int().min(1).default(1).catch(1),
    pageSize: z.number().int().min(1).max(100).default(20).catch(20),
  }),
  component: HistoryRoute,
})

function HistoryRoute() {
  const { tab, view, page, pageSize } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <HistoryPage tab={tab} view={view} page={page} pageSize={pageSize} onChange={(next) => navigate({ search: (s) => ({ ...s, ...next }) })} />
  )
}
