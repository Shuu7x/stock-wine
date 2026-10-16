import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { HISTORY_VIEWS, HistoryPage } from '@/features/history/components/HistoryPage'
import { MOVE_TYPES } from '@/features/history/movements'

export const Route = createFileRoute('/_authenticated/history/')({
  validateSearch: z.object({
    view: z.enum(HISTORY_VIEWS).default('rows').catch('rows'),
    /** มาจากหน้าทำรายการ: กรองประเภทนั้นไว้ให้ */
    type: z.enum(MOVE_TYPES).optional().catch(undefined),
  }),
  component: HistoryRoute,
})

function HistoryRoute() {
  const { view, type } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <HistoryPage view={view} initialType={type} onView={(v) => navigate({ search: (s) => ({ ...s, view: v }) })} />
}
