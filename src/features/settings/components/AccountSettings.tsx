import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useSessionEmail } from '@/features/auth/api/auth.api'
import { useChangePassword } from '../api/settings.api'
import { SettingRow, SettingsCard } from './SettingsLayout'

const schema = z
  .object({
    password: z.string().min(8, 'อย่างน้อย 8 ตัวอักษร'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'รหัสผ่านไม่ตรงกัน' })
type Values = z.infer<typeof schema>

// ข้อมูลที่หน้าเว็บจำไว้ในเครื่องนี้ (ไม่ใช่ข้อมูลในระบบ)
const LOCAL_PREFIXES = ['stock-wine:page-size:', 'stock-wine:receive-draft', 'stock-wine:withdraw-draft']

export function AccountSettings() {
  const email = useSessionEmail()
  const change = useChangePassword()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })

  const submit = form.handleSubmit(async (v) => {
    await change.mutateAsync(v.password)
    form.reset()
    toast.success('เปลี่ยนรหัสผ่านแล้ว')
  })

  function clearLocal() {
    if (!confirm('ล้างร่างใบรับเข้า/เบิกที่ยังไม่บันทึก และขนาดหน้าที่จำไว้ในเครื่องนี้?')) return
    let n = 0
    try {
      for (const k of Object.keys(localStorage)) {
        if (LOCAL_PREFIXES.some((p) => k.startsWith(p))) {
          localStorage.removeItem(k)
          n++
        }
      }
    } catch {
      /* เบราว์เซอร์ไม่อนุญาต */
    }
    toast.success(n ? `ล้างแล้ว ${n} รายการ` : 'ไม่มีข้อมูลที่ต้องล้าง')
  }

  const e = form.formState.errors
  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="บัญชี">
        <SettingRow label="อีเมลที่ใช้เข้าสู่ระบบ">
          <div className="truncate text-sm font-medium sm:text-right">{email ?? '—'}</div>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title="เปลี่ยนรหัสผ่าน"
        footer={
          <Button variant="primary" loading={change.isPending} onClick={submit}>
            <KeyRound className="size-4" /> เปลี่ยนรหัสผ่าน
          </Button>
        }
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="รหัสผ่านใหม่" error={e.password?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('password')} />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่" error={e.confirm?.message}>
            <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <button type="submit" hidden />
        </form>
      </SettingsCard>

      <SettingsCard title="ข้อมูลในเครื่องนี้">
        <SettingRow
          label="ล้างข้อมูลที่จำไว้"
          description="ร่างใบรับเข้า/เบิกที่ยังไม่บันทึก และจำนวนแถวต่อหน้าที่เลือกไว้ (ไม่กระทบข้อมูลในระบบ)"
        >
          <Button variant="secondary" className="w-full sm:w-auto" onClick={clearLocal}>
            <Trash2 className="size-4" /> ล้างข้อมูลในเครื่อง
          </Button>
        </SettingRow>
      </SettingsCard>
    </div>
  )
}
