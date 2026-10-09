import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Database, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Store = Tables<'stores'>
export type StockItem = Tables<'stock_items'>
export type StockItemPatch = Database['public']['Tables']['stock_items']['Update']

export const stockKeys = {
  all: ['stock'] as const,
  stores: () => [...stockKeys.all, 'stores'] as const,
  items: (includeDeleted: boolean) => [...stockKeys.all, 'items', { includeDeleted }] as const,
}

async function fetchStores() {
  const { data, error } = await supabase.from('stores').select('*').order('sort_order')
  if (error) throw error
  return data
}

const PAGE = 1000

/**
 * ดึงสต็อกทุกคลังมาทั้งชุด — หน้าจอแบบ Excel ต้องกรอง/เรียง/ค้นหาจากหัวคอลัมน์ได้ทุกค่า
 * ปริมาณไวน์ในห้องเก็บระดับหลักพันแถวจึงยังเบา ถ้าโตเกินหลักหมื่นให้ย้ายตัวกรองไปฝั่ง Postgres
 */
async function fetchStockItems(includeDeleted: boolean) {
  const out: StockItem[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('stock_items').select('*')
    if (!includeDeleted) q = q.is('deleted_at', null)
    const { data, error } = await q
      .order('store_id')
      .order('rack', { nullsFirst: false })
      .order('wine_name')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

export const storesOptions = () =>
  queryOptions({ queryKey: stockKeys.stores(), queryFn: fetchStores, staleTime: Infinity })

export const stockItemsOptions = (includeDeleted = false) =>
  queryOptions({ queryKey: stockKeys.items(includeDeleted), queryFn: () => fetchStockItems(includeDeleted) })

/** บันทึกการแก้ไข + ลบ (แบบเก็บประวัติ) ที่พักไว้ในหน้าสต็อก ในครั้งเดียว */
export function useSaveStockChanges() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { updates: Array<{ id: string; patch: StockItemPatch }>; deletes: string[] }) => {
      const { data, error } = await supabase.rpc('save_stock_changes', {
        p_updates: input.updates,
        p_deletes: input.deletes,
      })
      if (error) throw error
      return data
    },
    onSettled: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

/** กู้คืน/ลบทันที (ใช้กับปุ่มกู้คืนรายการที่ลบแล้ว) */
export function useArchiveStockItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, restore }: { ids: string[]; restore?: boolean }) => {
      const { data: auth } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('stock_items')
        .update(
          restore
            ? { deleted_at: null, deleted_by: null }
            : { deleted_at: new Date().toISOString(), deleted_by: auth.user?.id ?? null },
        )
        .in('id', ids)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  })
}
