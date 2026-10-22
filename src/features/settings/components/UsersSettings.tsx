import { useQuery } from '@tanstack/react-query'
import { Lock, Plus, Save, ShieldCheck, Trash2, Undo2, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DataGrid } from '@/components/data-grid/DataGrid'
import type { GridColumn } from '@/components/data-grid/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Loading } from '@/components/ui/loading'
import { Segmented } from '@/components/ui/segmented'
import { useSessionEmail } from '@/features/auth/api/auth.api'
import { env } from '@/lib/env'
import { cn } from '@/lib/cn'
import { fmtDateTime, fmtInt } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import {
  profilesOptions,
  rolesOptions,
  useCreateRole,
  useCreateUser,
  useDeleteRole,
  useDeleteUser,
  useSaveRolePermissions,
  useUpdateProfile,
  type Role,
} from '../api/access.api'
import { SettingsCard } from './SettingsLayout'

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')

export const USERS_TABS = ['users', 'roles'] as const
export type UsersTab = (typeof USERS_TABS)[number]

/** ผู้ใช้และสิทธิ์: แท็บ ผู้ใช้งาน (ตาราง เพิ่ม/แก้/ลบ) · บทบาทและสิทธิ์ (ตารางบทบาท × สิทธิ์) */
export function UsersSettings({ tab, onTab }: { tab: UsersTab; onTab: (t: UsersTab) => void }) {
  const rolesQ = useQuery(rolesOptions())
  const profilesQ = useQuery(profilesOptions())
  if (rolesQ.isLoading || profilesQ.isLoading) return <Loading screen />
  const roles = rolesQ.data ?? []
  const profiles = profilesQ.data ?? []
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={tab}
        onChange={onTab}
        items={[
          { value: 'users' as UsersTab, label: 'ผู้ใช้งาน', count: fmtInt(profiles.length) },
          { value: 'roles' as UsersTab, label: 'บทบาทและสิทธิ์', count: fmtInt(roles.length) },
        ]}
      />
      {tab === 'roles' ? <RolesMatrix roles={roles} usersByRole={countBy(profiles)} /> : <UsersList roles={roles} />}
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

// ─── ผู้ใช้ (ตารางแบบหน้าอื่น: แก้หลายแถวแล้วบันทึกทีเดียว) ──────────────────────────
type UserRow = { _id: string; email: string; display_name: string | null; role_key: string; is_active: boolean; created_at: string }
const ACTIVE = 'ใช้งาน'
const INACTIVE = 'ปิดใช้งาน'

function UsersList({ roles }: { roles: Role[] }) {
  const profilesQ = useQuery(profilesOptions())
  const update = useUpdateProfile()
  const remove = useDeleteUser()
  const me = useSessionEmail()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<UserRow[] | null>(null)
  const original = useMemo(() => new Map((profilesQ.data ?? []).map((p) => [p.user_id, p])), [profilesQ.data])
  const toRows = useCallback(
    () =>
      (profilesQ.data ?? []).map<UserRow>((p) => ({
        _id: p.user_id,
        email: p.email ?? '',
        display_name: p.display_name,
        role_key: p.role_key,
        is_active: p.is_active,
        created_at: p.created_at,
      })),
    [profilesQ.data],
  )
  const [rows, setRows] = useState<UserRow[]>([])
  useEffect(() => setRows(toRows()), [toRows])

  const changedFields = useCallback(
    (r: UserRow): string[] => {
      const o = original.get(r._id)
      if (!o) return []
      const out: string[] = []
      if ((r.display_name ?? '').trim() !== (o.display_name ?? '')) out.push('display_name')
      if (r.role_key !== o.role_key) out.push('role_key')
      if (r.is_active !== o.is_active) out.push('is_active')
      return out
    },
    [original],
  )
  const changed = rows.filter((r) => changedFields(r).length)
  const adminsLeft = rows.filter((r) => r.role_key === 'admin' && r.is_active).length

  const roleName = (key: string) => roles.find((r) => r.key === key)?.name ?? key
  const columns = useMemo<GridColumn<UserRow>[]>(
    () => [
      {
        key: 'email',
        title: 'อีเมล',
        width: 240,
        readOnly: true,
        frozen: true,
        render: (r) => (
          <span className="flex items-center gap-2">
            {r.email}
            {r.email.toLowerCase() === me?.toLowerCase() && <Badge tone="brand">คุณ</Badge>}
          </span>
        ),
      },
      { key: 'display_name', title: 'ชื่อที่แสดง', width: 200, placeholder: 'เช่น สมชาย (หน้าร้าน)' },
      {
        key: 'role_key',
        title: 'บทบาท',
        width: 170,
        type: 'select',
        options: roles.map((r) => r.name),
        get: (r) => roleName(r.role_key),
        set: (r, v) => ({ ...r, role_key: roles.find((x) => x.name === v)?.key ?? r.role_key }),
        render: (r) => <Badge tone={r.role_key === 'admin' ? 'brand' : r.role_key === 'viewer' ? 'neutral' : 'info'}>{roleName(r.role_key)}</Badge>,
      },
      {
        key: 'is_active',
        title: 'สถานะ',
        width: 130,
        type: 'select',
        options: [ACTIVE, INACTIVE],
        get: (r) => (r.is_active ? ACTIVE : INACTIVE),
        set: (r, v) => ({ ...r, is_active: v !== INACTIVE }),
        render: (r) => (r.is_active ? <Badge tone="success">{ACTIVE}</Badge> : <Badge>{INACTIVE}</Badge>),
      },
      { key: 'created_at', title: 'เพิ่มเมื่อ', width: 150, readOnly: true, format: (v) => fmtDateTime(String(v)) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, me],
  )

  const [picked, setPicked] = useState<string[]>([])
  function askDelete(ids: string[]) {
    const targets = rows.filter((r) => ids.includes(r._id))
    if (targets.some((r) => r.email.toLowerCase() === me?.toLowerCase())) return toast.error('ลบบัญชีของตัวเองไม่ได้')
    if (targets.length) setDeleting(targets)
  }
  async function confirmDelete() {
    if (!deleting) return
    try {
      for (const r of deleting) await remove.mutateAsync(r._id)
      toast.success(`ลบผู้ใช้แล้ว ${deleting.length} คน`)
      setDeleting(null)
      setPicked([])
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  async function save() {
    if (!adminsLeft) return toast.error('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน')
    try {
      // ลดสิทธิ์ผู้ดูแลทีหลัง — กันกรณีเปลี่ยนผู้ดูแลคนหนึ่งเป็นอีกคนในรอบเดียว
      const order = [...changed].sort((a, b) => Number(a.role_key !== 'admin') - Number(b.role_key !== 'admin'))
      for (const r of order) {
        await update.mutateAsync({
          userId: r._id,
          patch: { display_name: r.display_name?.trim() || null, role_key: r.role_key, is_active: r.is_active },
        })
      }
      toast.success(`บันทึกผู้ใช้แล้ว ${changed.length} คน`)
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
          ? 'โหมดทดลอง: login ด้วยอีเมลใหม่ (รหัส “password”) จะขึ้นในตารางนี้เป็น "ดูอย่างเดียว" · ผู้ใช้ตัวอย่าง manager@ / staff@ / viewer@wine.local'
          : 'เพิ่มผู้ใช้ด้วยการเชิญทางอีเมลที่ Supabase › Authentication — ผู้ใช้ใหม่ขึ้นในตารางนี้เป็น "ดูอย่างเดียว" แล้วค่อยเลือกบทบาทให้'
      }
      footer={
        changed.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-ink-2">แก้ {changed.length} คน · ดับเบิลคลิกเซลล์เพื่อแก้</span>
            <Button size="sm" variant="ghost" onClick={() => setRows(toRows())}>
              <Undo2 className="size-4" /> ยกเลิกทั้งหมด
            </Button>
            <Button size="sm" variant="primary" loading={update.isPending} onClick={save}>
              <Save className="size-4" /> บันทึก
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> เพิ่มผู้ใช้
          </Button>
          {picked.length > 0 && (
            <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => askDelete(picked)}>
              <Trash2 className="size-4" /> ลบผู้ใช้ที่เลือก ({picked.length})
            </Button>
          )}
          <span className="ml-auto hidden text-xs text-muted sm:inline">ดับเบิลคลิกเพื่อแก้ชื่อ / บทบาท / สถานะ · ติ๊กแถวแล้วกดลบ</span>
        </div>
        <DataGrid
          className="h-[min(420px,60dvh)]"
          rows={rows}
          columns={columns}
          getRowId={(r) => r._id}
          onRowsChange={setRows}
          onSelectionChange={setPicked}
          onDeleteRows={(ids) => askDelete(ids)}
          cellChanged={(r, key) => changedFields(r).includes(key)}
          cellError={(r, key) => (key === 'role_key' || key === 'is_active') && !adminsLeft && original.get(r._id)?.role_key === 'admin' ? 'ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน' : null}
          rowClassName={(r) => (r.is_active ? undefined : 'text-muted')}
          pageSizeKey="settings-users"
          card={{ noun: 'ผู้ใช้', title: (r) => r.display_name || r.email, subtitle: (r) => r.email, fields: ['role_key', 'is_active'] }}
          emptyState="ยังไม่มีผู้ใช้"
        />
      </div>
      <AddUserDialog open={adding} onClose={() => setAdding(false)} roles={roles} />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`ลบผู้ใช้ ${deleting?.length ?? 0} คน?`}
        description="ผู้ใช้จะเข้าสู่ระบบไม่ได้อีก · เอกสารที่เคยบันทึกยังอยู่ครบ (มีอีเมลผู้บันทึก) · ถ้าแค่ต้องการพักการใช้งาน ให้เปลี่ยนสถานะเป็น ปิดใช้งาน แทน"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>ไม่ลบ</Button>
            <Button variant="danger" loading={remove.isPending} onClick={confirmDelete}>
              <Trash2 className="size-4" /> ลบผู้ใช้
            </Button>
          </>
        }
      >
        <ul className="list-disc pl-5 text-sm">
          {deleting?.map((r) => (
            <li key={r._id}>
              {r.email}
              {r.display_name ? ` (${r.display_name})` : ''}
            </li>
          ))}
        </ul>
      </Dialog>
    </SettingsCard>
  )
}

function AddUserDialog({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: Role[] }) {
  const create = useCreateUser()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('staff')
  const [password, setPassword] = useState('')
  useEffect(() => {
    if (open) (setEmail(''), setName(''), setRole(roles.some((r) => r.key === 'staff') ? 'staff' : (roles[0]?.key ?? 'viewer')), setPassword(''))
  }, [open, roles])
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim())
  const pwOk = password.length >= 8
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="เพิ่มผู้ใช้"
      description="ตั้งรหัสผ่านเริ่มต้นให้ แล้วแจ้งผู้ใช้ — เปลี่ยนรหัสเองได้ที่ ตั้งค่า › บัญชีของฉัน"
      footer={
        <>
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!emailOk || !pwOk}
            onClick={async () => {
              try {
                const r = await create.mutateAsync({ email, password, displayName: name, roleKey: role })
                toast.success(`เพิ่มผู้ใช้ ${email.trim()} แล้ว`, {
                  description: r.needsConfirm && !env.VITE_ENABLE_MOCK ? 'ผู้ใช้ต้องกดยืนยันอีเมลก่อนเข้าสู่ระบบครั้งแรก' : undefined,
                })
                onClose()
              } catch (e) {
                toast.error(errMsg(e))
              }
            }}
          >
            <UserPlus className="size-4" /> เพิ่มผู้ใช้
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="อีเมล" error={email && !emailOk ? 'รูปแบบอีเมลไม่ถูกต้อง' : undefined} className="sm:col-span-2">
          <Input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="ชื่อที่แสดง">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมชาย (หน้าร้าน)" />
        </Field>
        <Field label="บทบาท">
          <Combobox value={role} onChange={setRole} options={roles.map((r) => ({ value: r.key, label: r.name }))} />
        </Field>
        <Field label="รหัสผ่านเริ่มต้น" error={password && !pwOk ? 'อย่างน้อย 8 ตัวอักษร' : undefined} className="sm:col-span-2">
          <Input type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" />
        </Field>
      </div>
    </Dialog>
  )
}
