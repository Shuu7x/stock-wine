import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { accessKeys } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'

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
