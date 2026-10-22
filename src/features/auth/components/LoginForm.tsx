import { zodResolver } from '@hookform/resolvers/zod'
import { Wine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { env } from '@/lib/env'
import { signIn } from '../api/auth.api'
import { playReveal } from '../reveal-transition'
import { WineRipple } from './WineRipple'

const schema = z.object({
  email: z.email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรอกรหัสผ่าน'),
})
type Values = z.infer<typeof schema>

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [error, setError] = useState<string | null>(null)
  // รหัสผิด: การ์ดสั่น + ผิวไวน์สั่นไหว · สำเร็จ: เข้าหน้าหลักทันที วงคลื่นจากปุ่มเผยหน้าหลักออกมา
  const [shake, setShake] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shake || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    formRef.current?.animate(
      [0, -10, 8, -6, 3, 0].map((x) => ({ translate: `${x}px 0` })),
      { duration: 450, easing: 'ease-in-out' },
    )
  }, [shake])
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: env.VITE_ENABLE_MOCK ? { email: 'admin@wine.local', password: 'password' } : undefined,
  })

  const submit = form.handleSubmit(
    async (v) => {
      setError(null)
      try {
        await signIn(v.email, v.password)
      } catch (e) {
        setError((e as Error).message)
        setShake((n) => n + 1)
        return
      }
      const btn = formRef.current?.querySelector('button[type=submit]')?.getBoundingClientRect()
      playReveal({
        canvas: sceneRef.current?.querySelector('canvas') ?? null,
        card: formRef.current,
        x: btn ? btn.left + btn.width / 2 : innerWidth / 2,
        y: btn ? btn.top + btn.height / 2 : innerHeight / 2,
      })
      onSuccess()
    },
    () => setShake((n) => n + 1),
  )

  return (
    <div ref={sceneRef} className="relative flex min-h-full items-center justify-center overflow-hidden bg-night-900 p-4">
      <WineRipple tremble={shake} />
      <form
        ref={formRef}
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/40 bg-surface/90 p-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md sm:p-8"
      >
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
            <PasswordInput autoComplete="current-password" {...form.register('password')} />
          </Field>
          {error && <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</div>}
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting} className="w-full">
            เข้าสู่ระบบ
          </Button>
          {env.VITE_ENABLE_MOCK && (
            <p className="text-center text-xs text-muted">
              โหมดทดลอง (mock): รหัสผ่าน “password” · ลองบทบาทต่างๆ ด้วย admin@ / manager@ / staff@ / viewer@wine.local
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
