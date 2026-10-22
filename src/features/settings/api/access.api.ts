import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { accessKeys } from '@/lib/permissions'
import { signupClient, supabase } from '@/lib/supabase'

export type Role = Tables<'roles'>
export type Profile = Tables<'profiles'>

export const accessAdminKeys = {
  all: ['access-admin'] as const,
  roles: () => [...accessAdminKeys.all, 'roles'] as const,
  profiles: () => [...accessAdminKeys.all, 'profiles'] as const,
}

export const rolesOptions = () =>
  queryOptions({
    queryKey: accessAdminKeys.roles(),
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*').order('sort_order').order('key')
      if (error) throw error
      return data
    },
  })

export const profilesOptions = () =>
  queryOptions({
    queryKey: accessAdminKeys.profiles(),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('email')
      if (error) throw error
      return data
    },
  })

function useInvalidate() {
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: accessAdminKeys.all }), qc.invalidateQueries({ queryKey: accessKeys.me })])
}

/** บันทึกสิทธิ์ของหลายบทบาท (ตารางบทบาท × สิทธิ์) */
export function useSaveRolePermissions() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (changes: Array<{ key: string; permissions: string[] }>) => {
      for (const c of changes) {
        const { error } = await supabase.from('roles').update({ permissions: c.permissions }).eq('key', c.key)
        if (error) throw error
      }
    },
    onSettled: invalidate,
  })
}

export function useCreateRole() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (r: { key: string; name: string; description: string | null; permissions: string[]; sort_order: number }) => {
      const { error } = await supabase.from('roles').insert(r)
      if (error) throw error
    },
    onSettled: invalidate,
  })
}

export function useDeleteRole() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (key: string) => {
      const { error } = await supabase.from('roles').delete().eq('key', key)
      if (error) throw error
    },
    onSettled: invalidate,
  })
}

export function useUpdateProfile() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: { role_key?: string; is_active?: boolean; display_name?: string | null } }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId)
      if (error) throw error
    },
    onSettled: invalidate,
  })
}

/** เพิ่มผู้ใช้: สมัครให้ (trigger สร้าง profile เป็น viewer) แล้วตั้งชื่อ/บทบาท */
export function useCreateUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (u: { email: string; password: string; displayName: string; roleKey: string }) => {
      const { data, error } = await signupClient().auth.signUp({
        email: u.email.trim(),
        password: u.password,
        options: { data: { name: u.displayName.trim() } },
      })
      if (error) {
        throw new Error(
          /already registered|already exists/i.test(error.message)
            ? 'อีเมลนี้มีผู้ใช้อยู่แล้ว'
            : /signups? (are )?not allowed|disabled/i.test(error.message)
              ? 'ระบบปิดการสมัครผู้ใช้ — เปิด "Allow new users to sign up" ใน Supabase › Authentication'
              : error.message,
        )
      }
      const id = data.user?.id
      if (!id) throw new Error('สร้างผู้ใช้ไม่สำเร็จ')
      const { error: e2 } = await supabase
        .from('profiles')
        .update({ display_name: u.displayName.trim() || null, role_key: u.roleKey })
        .eq('user_id', id)
      if (e2) throw e2
      return { id, needsConfirm: !data.session }
    },
    onSettled: invalidate,
  })
}

export function useDeleteUser() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('delete_user', { p_user_id: userId })
      if (error) throw error
    },
    onSettled: invalidate,
  })
}
