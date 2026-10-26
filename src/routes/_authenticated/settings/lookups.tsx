import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LookupsSettings } from '@/features/settings/components/LookupsSettings'

export const Route = createFileRoute('/_authenticated/settings/lookups')({
  validateSearch: z.object({
    tab: z.enum(['stores', 'wine_type', 'bottle_size', 'country', 'region', 'supplier', 'rack', 'sorting']).default('stores').catch('stores'),
  }),
  component: MasterDataRoute,
})

function MasterDataRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <LookupsSettings tab={tab} onTab={(t) => navigate({ search: { tab: t }, replace: true })} />
}
