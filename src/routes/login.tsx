import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { getSession } from '@/features/auth/api/auth.api'
import { LoginForm } from '@/features/auth/components/LoginForm'

/**
 * หลังล็อกอินไปหน้าสต็อกเสมอ
 * ยกเว้นลิงก์จากการสแกน QR ป้ายขวด (/i/…, /item/…) ที่ต้องพาไปหน้าไวน์ขวดนั้น
 */
function afterLogin(redirectTo?: string) {
  if (!redirectTo) return '/stock'
  const path = redirectTo.startsWith('http') ? new URL(redirectTo).pathname : redirectTo
  return /^\/(i|item)\//.test(path) ? redirectTo : '/stock'
}

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  beforeLoad: async ({ search }) => {
    if (await getSession()) throw redirect({ to: afterLogin(search.redirect) })
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: to } = Route.useSearch()
  const navigate = useNavigate()
  return <LoginForm onSuccess={() => navigate({ to: afterLogin(to) })} />
}
