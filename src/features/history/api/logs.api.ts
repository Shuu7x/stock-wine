import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import type { StockAction, Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { stockKeys } from '@/features/stock/api/stock.api'

export type StockItemLog = Tables<'stock_item_logs'>

export type LogsSearch = {
  page: number
  pageSize: number
  stockItemId?: string
  action?: StockAction
}

export const logKeys = {
  // อยู่ใต้ stockKeys.all: ทุก mutation ที่ invalidate สต็อกจะรีเฟรชประวัติไปด้วย
  all: [...stockKeys.all, 'logs'] as const,
  list: (s: LogsSearch) => [...logKeys.all, 'list', s] as const,
}

async function fetchLogs(s: LogsSearch) {
  const from = (s.page - 1) * s.pageSize
  let q = supabase.from('stock_item_logs').select('*', { count: 'exact' })
  if (s.stockItemId) q = q.eq('stock_item_id', s.stockItemId)
  if (s.action) q = q.eq('action', s.action)
  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + s.pageSize - 1)
  if (error) throw error
  return { items: data, total: count ?? 0 }
}

export const logsListOptions = (s: LogsSearch) =>
  queryOptions({
    queryKey: logKeys.list(s),
    queryFn: () => fetchLogs(s),
    placeholderData: keepPreviousData,
  })
