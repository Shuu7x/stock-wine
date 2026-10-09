import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { getSession } from '@/features/auth/api/auth.api'
import { LoginForm } from '@/features/auth/components/LoginForm'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  beforeLoad: async ({ search }) => {
    if (await getSession()) throw redirect({ to: search.redirect ?? '/stock' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: to } = Route.useSearch()
  const navigate = useNavigate()
  return <LoginForm onSuccess={() => navigate({ to: to ?? '/stock' })} />
}
