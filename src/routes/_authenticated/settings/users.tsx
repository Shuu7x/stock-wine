import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { USERS_TABS, UsersSettings } from '@/features/settings/components/UsersSettings'

export const Route = createFileRoute('/_authenticated/settings/users')({
  validateSearch: z.object({ tab: z.enum(USERS_TABS).default('users').catch('users') }),
  component: UsersRoute,
})

function UsersRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <UsersSettings tab={tab} onTab={(t) => navigate({ search: { tab: t }, replace: true })} />
}
