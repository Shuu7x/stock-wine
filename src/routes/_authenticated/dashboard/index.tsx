import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { DashboardPage } from '@/features/dashboard/components/DashboardPage'

export const Route = createFileRoute('/_authenticated/dashboard/')({
  validateSearch: z.object({ period: z.enum(['7d', '30d', 'month', 'year']).default('30d').catch('30d') }),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { period } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <DashboardPage period={period} onPeriod={(p) => navigate({ search: { period: p }, replace: true })} />
}
