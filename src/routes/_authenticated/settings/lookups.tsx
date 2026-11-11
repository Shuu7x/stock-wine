import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LookupsSettings, TAB_ORDER } from '@/features/settings/components/LookupsSettings'

export const Route = createFileRoute('/_authenticated/settings/lookups')({
  validateSearch: z.object({
    // ไม่ระบุแท็บ = แท็บแรก (ประเทศ)
    tab: z.enum(TAB_ORDER).default('country').catch('country'),
  }),
  component: MasterDataRoute,
})

function MasterDataRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <LookupsSettings tab={tab} onTab={(t) => navigate({ search: { tab: t }, replace: true })} />
}
