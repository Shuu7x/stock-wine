import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { applyDocFilter, type DocFilter } from '@/lib/doc-filter'
import { supabase } from '@/lib/supabase'
import { stockKeys } from '@/features/stock/api/stock.api'

export type Withdrawal = Tables<'withdrawals'>
export type WithdrawalLine = Tables<'withdrawal_lines'>
export type WithdrawalWithLines = Withdrawal & { withdrawal_lines: WithdrawalLine[] }

export type WithdrawalLineInput = Pick<WithdrawalLine, 'stock_item_id' | 'qty' | 'withdraw_date' | 'remark'>

export const withdrawalKeys = {
  all: ['withdrawals'] as const,
  list: (page: number, pageSize: number, f: DocFilter = {}) => [...withdrawalKeys.all, 'list', { page, pageSize, ...f }] as const,
}

async function fetchWithdrawals(page: number, pageSize: number, f: DocFilter) {
  const from = (page - 1) * pageSize
  const { data, count, error } = await applyDocFilter(
    supabase.from('withdrawals').select('*, withdrawal_lines(*)', { count: 'exact' }),
    'created_at',
    f,
    true,
  )
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return { items: data as WithdrawalWithLines[], total: count ?? 0 }
}

export const withdrawalsListOptions = (page: number, pageSize = 20, f: DocFilter = {}) =>
  queryOptions({
    queryKey: withdrawalKeys.list(page, pageSize, f),
    queryFn: () => fetchWithdrawals(page, pageSize, f),
    placeholderData: keepPreviousData,
  })

export function usePostWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { note: string; lines: WithdrawalLineInput[] }) => {
      const { data, error } = await supabase.rpc('post_withdrawal', {
        p_note: input.note || null,
        p_lines: input.lines,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: withdrawalKeys.all })
    },
  })
}

export function useVoidWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase.rpc('void_withdrawal', { p_id: id, p_reason: reason || null })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: withdrawalKeys.all })
    },
  })
}
