import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { stockKeys } from '@/features/stock/api/stock.api'

export type Receipt = Tables<'receipts'>
export type ReceiptLine = Tables<'receipt_lines'>
export type ReceiptWithLines = Receipt & { receipt_lines: ReceiptLine[] }

export type ReceiptLineInput = Pick<
  ReceiptLine,
  | 'store_id'
  | 'rack'
  | 'country'
  | 'wine_name'
  | 'vintage'
  | 'rating_rp'
  | 'rating_ws'
  | 'maturity_from'
  | 'maturity_to'
  | 'qty'
  | 'price_per_bottle'
  | 'supplier'
  | 'purchase_date'
  | 'remark'
>

export const receiptKeys = {
  all: ['receipts'] as const,
  list: (page: number, pageSize: number) => [...receiptKeys.all, 'list', { page, pageSize }] as const,
}

async function fetchReceipts(page: number, pageSize: number) {
  const from = (page - 1) * pageSize
  const { data, count, error } = await supabase
    .from('receipts')
    .select('*, receipt_lines(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return { items: data as ReceiptWithLines[], total: count ?? 0 }
}

export const receiptsListOptions = (page: number, pageSize = 20) =>
  queryOptions({
    queryKey: receiptKeys.list(page, pageSize),
    queryFn: () => fetchReceipts(page, pageSize),
    placeholderData: keepPreviousData,
  })

export function usePostReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { receivedAt: string; note: string; lines: ReceiptLineInput[] }) => {
      const { data, error } = await supabase.rpc('post_receipt', {
        p_received_at: input.receivedAt,
        p_note: input.note || null,
        p_lines: input.lines,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: receiptKeys.all })
    },
  })
}

export function useVoidReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc('void_receipt', { p_id: id, p_reason: reason || null })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: receiptKeys.all })
    },
  })
}
