import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database, Json, LookupCategory, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { stockKeys } from '@/features/stock/api/stock.api'
import { DEFAULT_SETTINGS, parseSettings, type AppSettings } from '../app-settings'

export type LookupValue = Tables<'lookup_values'>
export type LookupWrite = Database['public']['Tables']['lookup_values']['Insert'] & { id?: string }
export type StoreWrite = Database['public']['Tables']['stores']['Update']

export const settingsKeys = {
  all: ['settings'] as const,
  app: () => [...settingsKeys.all, 'app'] as const,
  lookups: () => [...settingsKeys.all, 'lookups'] as const,
}

// ─── ค่าระบบ ────────────────────────────────────────────────────────────────
export const appSettingsOptions = () =>
  queryOptions({
    queryKey: settingsKeys.app(),
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('key, value')
      if (error) throw error
      return parseSettings(data)
    },
    staleTime: 5 * 60_000,
  })

/** ค่าตั้งค่าพร้อม default ระหว่างโหลด */
export function useAppSettings(): AppSettings {
  return useQuery(appSettingsOptions()).data ?? DEFAULT_SETTINGS
}

export function useSaveAppSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<AppSettings>) => {
      const rows = Object.entries(values).map(([key, value]) => ({ key, value: value as Json }))
      const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKeys.app() }),
  })
}

// ─── ตัวเลือกที่ใช้บ่อย ──────────────────────────────────────────────────────────
export const lookupValuesOptions = () =>
  queryOptions({
    queryKey: settingsKeys.lookups(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lookup_values')
        .select('*')
        .order('category')
        .order('sort_order')
        .order('value')
      if (error) throw error
      return data
    },
    staleTime: 5 * 60_000,
  })

export function useSaveLookupValues() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: LookupWrite[]) => {
      if (!rows.length) return
      const { error } = await supabase.from('lookup_values').upsert(rows, { onConflict: 'id' })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: settingsKeys.lookups() }),
  })
}

export type { LookupCategory }

// ─── คลัง ────────────────────────────────────────────────────────────────────
export function useSaveStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: number; values: StoreWrite & { code: string; name: string } }) => {
      const { error } = id
        ? await supabase.from('stores').update(values).eq('id', id)
        : await supabase.from('stores').insert(values)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

// ─── บัญชีของฉัน ──────────────────────────────────────────────────────────────
export function useChangePassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        throw new Error(error.code === 'weak_password' ? 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' : error.message)
      }
    },
  })
}
