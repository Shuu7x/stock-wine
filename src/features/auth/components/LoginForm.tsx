import { zodResolver } from '@hookform/resolvers/zod'
import { Wine } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { env } from '@/lib/env'
import { signIn } from '../api/auth.api'

const schema = z.object({
  email: z.email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรอกรหัสผ่าน'),
})
type Values = z.infer<typeof schema>

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: env.VITE_ENABLE_MOCK ? { email: 'admin@wine.local', password: 'password' } : undefined,
  })

  const submit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      await signIn(v.email, v.password)
      onSuccess()
    } catch (e) {
      setError((e as Error).message)
    }
  })

  return (
    <div className="flex min-h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,var(--color-brand-100),var(--color-canvas)_60%)] p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-700 text-gold-100 shadow-lg">
            <Wine className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-brand-900">Wine Cellar</h1>
          <p className="text-sm text-muted">ระบบสต็อกไวน์</p>
        </div>
        <div className="flex flex-col gap-4">
          <Field label="อีเมล" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="username" {...form.register('email')} />
          </Field>
          <Field label="รหัสผ่าน" error={form.formState.errors.password?.message}>
            <Input type="password" autoComplete="current-password" {...form.register('password')} />
          </Field>
          {error && <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div>}
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting} className="w-full">
            เข้าสู่ระบบ
          </Button>
          {env.VITE_ENABLE_MOCK && (
            <p className="text-center text-xs text-muted">โหมดทดลอง (mock): อีเมลใดก็ได้ รหัสผ่าน “password”</p>
          )}
        </div>
      </form>
    </div>
  )
}
