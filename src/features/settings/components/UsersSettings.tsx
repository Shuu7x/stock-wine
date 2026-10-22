import { useQuery } from '@tanstack/react-query'
import { Lock, Plus, Save, ShieldCheck, Trash2, Undo2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Loading } from '@/components/ui/loading'
import { Switch } from '@/components/ui/switch'
import { useSessionEmail } from '@/features/auth/api/auth.api'
import { env } from '@/lib/env'
import { cn } from '@/lib/cn'
import { PERMISSIONS } from '@/lib/permissions'
import {
  profilesOptions,
  rolesOptions,
  useCreateRole,
  useDeleteRole,
  useSaveRolePermissions,
  useUpdateProfile,
  type Role,
} from '../api/access.api'
import { SettingsCard } from './SettingsLayout'

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')

/** ผู้ใช้และสิทธิ์: ตารางบทบาท × สิทธิ์ + ผู้ใช้แต่ละคนเลือกบทบาท */
export function UsersSettings() {
  const rolesQ = useQuery(rolesOptions())
  const profilesQ = useQuery(profilesOptions())
  if (rolesQ.isLoading || profilesQ.isLoading) return <Loading screen />
  const roles = rolesQ.data ?? []
  return (
    <div className="flex flex-col gap-4">
      <RolesMatrix roles={roles} usersByRole={countBy(profilesQ.data ?? [])} />
      <UsersList roles={roles} />
    </div>
  )
}

function countBy(profiles: Array<{ role_key: string }>) {
  const m = new Map<string, number>()
  for (const p of profiles) m.set(p.role_key, (m.get(p.role_key) ?? 0) + 1)
  return m
}

// ─── บทบาท × สิทธิ์ ─────────────────────────────────────────────────────────
function RolesMatrix({ roles, usersByRole }: { roles: Role[]; usersByRole: Map<string, number> }) {
  const save = useSaveRolePermissions()
  const del = useDeleteRole()
  const [draft, setDraft] = useState<Record<string, Set<string>>>({})
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    setDraft(Object.fromEntries(roles.map((r) => [r.key, new Set(r.permissions)])))
  }, [roles])

  const changed = roles.filter((r) => {
    const d = draft[r.key]
    return d && (d.size !== r.permissions.length || r.permissions.some((p) => !d.has(p)))
  })

  function toggle(role: string, perm: string) {
    setDraft((d) => {
      const s = new Set(d[role])
      if (s.has(perm)) s.delete(perm)
      else s.add(perm)
      return { ...d, [role]: s }
    })
  }

  return (
    <SettingsCard
      title="บทบาทและสิทธิ์"
      icon={ShieldCheck}
      description="ติ๊กสิทธิ์ของแต่ละบทบาท · ผู้ดูแลระบบมีสิทธิ์ครบเสมอ · ทุกคนดูหน้าสต็อกได้ · ฐานข้อมูลบังคับสิทธิ์จริง (ไม่ใช่แค่ซ่อนปุ่ม)"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> เพิ่มบทบาท
          </Button>
          {changed.length > 0 && (
            <>
              <span className="ml-auto text-sm text-ink-2">แก้ {changed.length} บทบาท</span>
              <Button size="sm" variant="ghost" onClick={() => setDraft(Object.fromEntries(roles.map((r) => [r.key, new Set(r.permissions)])))}>
                <Undo2 className="size-4" /> ยกเลิก
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={save.isPending}
                onClick={async () => {
                  try {
                    await save.mutateAsync(changed.map((r) => ({ key: r.key, permissions: PERMISSIONS.map((p) => p.key).filter((k) => draft[r.key].has(k)) })))
                    toast.success('บันทึกสิทธิ์แล้ว')
                  } catch (e) {
                    toast.error(errMsg(e))
                  }
                }}
              >
                <Save className="size-4" /> บันทึกสิทธิ์
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-surface-2 text-xs text-ink-2">
              <th className="w-56 px-4 py-2 text-left font-medium">สิทธิ์</th>
              {roles.map((r) => (
                <th key={r.key} className="px-2 py-2 text-center font-medium">
                  <div className="flex items-center justify-center gap-1 font-semibold text-ink">
                    {r.key === 'admin' && <Lock className="size-3 text-muted" />}
                    {r.name}
                  </div>
                  <div className="font-normal text-muted">{usersByRole.get(r.key) ?? 0} คน</div>
                  {!r.is_system && (
                    <button
                      type="button"
                      title={`ลบบทบาท ${r.name}`}
                      onClick={async () => {
                        try {
                          await del.mutateAsync(r.key)
                          toast.success(`ลบบทบาท ${r.name} แล้ว`)
                        } catch (e) {
                          toast.error(errMsg(e))
                        }
                      }}
                      className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-danger-700 hover:underline"
                    >
                      <Trash2 className="size-3" /> ลบ
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <PermGroup key={g} group={g} roles={roles} draft={draft} onToggle={toggle} />
            ))}
          </tbody>
        </table>
      </div>
      <AddRoleDialog open={adding} onClose={() => setAdding(false)} roles={roles} />
    </SettingsCard>
  )
}

function PermGroup({
  group,
  roles,
  draft,
  onToggle,
}: {
  group: string
  roles: Role[]
  draft: Record<string, Set<string>>
  onToggle: (role: string, perm: string) => void
}) {
  return (
    <>
      <tr>
        <td colSpan={roles.length + 1} className="bg-surface-3/60 px-4 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
          {group}
        </td>
      </tr>
      {PERMISSIONS.filter((p) => p.group === group).map((p) => (
        <tr key={p.key} className="border-b border-line last:border-b-0">
          <td className="px-4 py-2">
            {p.label}
            <span className="ml-2 font-mono text-[11px] text-muted">{p.key}</span>
          </td>
          {roles.map((r) => {
            const locked = r.key === 'admin'
            const on = locked || !!draft[r.key]?.has(p.key)
            const dirty = !locked && on !== r.permissions.includes(p.key)
            return (
              <td key={r.key} className={cn('px-2 py-2 text-center', dirty && 'bg-warning-100')}>
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700 disabled:opacity-60"
                  checked={on}
                  disabled={locked}
                  aria-label={`${r.name}: ${p.label}`}
                  onChange={() => onToggle(r.key, p.key)}
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

function AddRoleDialog({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: Role[] }) {
  const create = useCreateRole()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [copy, setCopy] = useState('viewer')
  useEffect(() => {
    if (open) (setName(''), setKey(''), setCopy('viewer'))
  }, [open])
  const keyOk = /^[a-z0-9_]{2,30}$/.test(key)
  const dup = roles.some((r) => r.key === key)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เพิ่มบทบาท"
      description="ตั้งชื่อแล้วเลือกบทบาทที่จะคัดลอกสิทธิ์มาเป็นค่าเริ่มต้น — ปรับสิทธิ์ต่อได้ในตาราง"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!name.trim() || !keyOk || dup}
            onClick={async () => {
              try {
                await create.mutateAsync({
                  key,
                  name: name.trim(),
                  description: null,
                  permissions: roles.find((r) => r.key === copy)?.permissions ?? [],
                  sort_order: Math.max(0, ...roles.map((r) => r.sort_order)) + 1,
                })
                toast.success(`เพิ่มบทบาท ${name.trim()} แล้ว`)
                onClose()
              } catch (e) {
                toast.error(errMsg(e))
              }
            }}
          >
            เพิ่มบทบาท
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อบทบาท">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ซอมเมอลิเย่ร์" />
        </Field>
        <Field label="รหัส (a-z 0-9 _)" error={key && !keyOk ? 'ใช้ a-z 0-9 _ 2–30 ตัว' : dup ? 'รหัสนี้มีแล้ว' : undefined}>
          <Input className="font-mono" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="sommelier" />
        </Field>
        <Field label="คัดลอกสิทธิ์จาก" className="sm:col-span-2">
          <Combobox value={copy} onChange={setCopy} options={roles.map((r) => ({ value: r.key, label: r.name }))} />
        </Field>
      </div>
    </Dialog>
  )
}

// ─── ผู้ใช้ ──────────────────────────────────────────────────────────────────
function UsersList({ roles }: { roles: Role[] }) {
  const profilesQ = useQuery(profilesOptions())
  const update = useUpdateProfile()
  const me = useSessionEmail()
  const profiles = useMemo(() => profilesQ.data ?? [], [profilesQ.data])

  async function change(userId: string, patch: { role_key?: string; is_active?: boolean }, msg: string) {
    try {
      await update.mutateAsync({ userId, patch })
      toast.success(msg)
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <SettingsCard
      title="ผู้ใช้"
      icon={Users}
      description={
        env.VITE_ENABLE_MOCK
          ? 'โหมดทดลอง: login ด้วยอีเมลใหม่ (รหัส “password”) จะขึ้นในรายการนี้เป็น "ดูอย่างเดียว" · ผู้ใช้ตัวอย่าง manager@ / staff@ / viewer@wine.local'
          : 'เพิ่มผู้ใช้ด้วยการเชิญทางอีเมลที่ Supabase › Authentication — ผู้ใช้ใหม่ขึ้นในรายการนี้เป็น "ดูอย่างเดียว" แล้วค่อยเลือกบทบาทให้'
      }
    >
      <ul className="divide-y divide-line border-t border-line">
        {profiles.map((p) => {
          const self = p.email?.toLowerCase() === me?.toLowerCase()
          return (
            <li key={p.user_id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !p.is_active && 'opacity-60')}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800 uppercase">
                {(p.display_name || p.email || '?').slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate font-medium">
                  {p.display_name || p.email?.split('@')[0]}
                  {self && <Badge tone="brand">คุณ</Badge>}
                  {!p.is_active && <Badge>ปิดการใช้งาน</Badge>}
                </div>
                <div className="truncate text-xs text-muted">{p.email}</div>
              </div>
              <Combobox
                className="w-44"
                value={p.role_key}
                onChange={(v) => v !== p.role_key && change(p.user_id, { role_key: v }, `${p.email}: ${roles.find((r) => r.key === v)?.name}`)}
                options={roles.map((r) => ({ value: r.key, label: r.name }))}
              />
              <Switch
                checked={p.is_active}
                onChange={(v) => change(p.user_id, { is_active: v }, v ? `เปิดใช้งาน ${p.email}` : `ปิดใช้งาน ${p.email}`)}
                label={`ใช้งาน ${p.email}`}
                states={['ใช้งาน', 'ปิด']}
              />
            </li>
          )
        })}
      </ul>
    </SettingsCard>
  )
}
