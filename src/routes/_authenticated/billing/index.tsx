import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { BillingPage } from '@/features/billing/components/BillingPage'

export const Route = createFileRoute('/_authenticated/billing/')({
  validateSearch: z.object({ tab: z.enum(['pending', 'issued']).default('pending').catch('pending') }),
  component: function Page() {
    const { tab } = Route.useSearch()
    const navigate = Route.useNavigate()
    return <BillingPage tab={tab} onTab={(t) => navigate({ search: { tab: t } })} />
  },
})
