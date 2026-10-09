import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables, VatMode } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { stockKeys } from '@/features/stock/api/stock.api'

export type Sale = Tables<'sales'>
export type SaleLine = Tables<'sale_lines'>
export type SaleWithLines = Sale & { sale_lines: SaleLine[] }
export type Adjustment = Tables<'stock_adjustments'>
export type AdjustmentLine = Tables<'stock_adjustment_lines'>
export type AdjustmentWithLines = Adjustment & { stock_adjustment_lines: AdjustmentLine[] }
export type Transfer = Tables<'transfers'>
export type TransferLine = Tables<'transfer_lines'>
export type TransferWithLines = Transfer & { transfer_lines: TransferLine[] }

export type SaleLineInput = { stock_item_id: string; qty: number; unit_price: number; has_vat: boolean; remark: string | null }
export type AdjustmentLineInput = { stock_item_id: string; counted: number; reason: string; remark: string | null }
export type TransferLineInput = { stock_item_id: string; qty: number; to_store_id: number; to_rack: string | null; remark: string | null }

export const opKeys = {
  sales: (page: number, size: number) => ['ops', 'sales', { page, size }] as const,
  adjustments: (page: number, size: number) => ['ops', 'adjustments', { page, size }] as const,
  transfers: (page: number, size: number) => ['ops', 'transfers', { page, size }] as const,
}

const range = (page: number, size: number) => [(page - 1) * size, page * size - 1] as const

export const salesListOptions = (page: number, size = 20) =>
  queryOptions({
    queryKey: opKeys.sales(page, size),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('sales')
        .select('*, sale_lines(*)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range(page, size))
      if (error) throw error
      return { items: data as SaleWithLines[], total: count ?? 0 }
    },
  })

export const adjustmentsListOptions = (page: number, size = 20) =>
  queryOptions({
    queryKey: opKeys.adjustments(page, size),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('stock_adjustments')
        .select('*, stock_adjustment_lines(*)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range(page, size))
      if (error) throw error
      return { items: data as AdjustmentWithLines[], total: count ?? 0 }
    },
  })

export const transfersListOptions = (page: number, size = 20) =>
  queryOptions({
    queryKey: opKeys.transfers(page, size),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('transfers')
        .select('*, transfer_lines(*)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(...range(page, size))
      if (error) throw error
      return { items: data as TransferWithLines[], total: count ?? 0 }
    },
  })

/** mutation ที่เปลี่ยนยอดสต็อก: สำเร็จแล้วรีเฟรชสต็อก (รวมประวัติ) และรายการเอกสาร */
function useStockMutation<A, T>(fn: (a: A) => Promise<T>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stockKeys.all })
      qc.invalidateQueries({ queryKey: ['ops'] })
    },
  })
}

const unwrap = <T,>(r: { data: T | null; error: unknown }) => {
  if (r.error) throw r.error
  return r.data as T
}

export const usePostSale = () =>
  useStockMutation(async (a: { soldAt: string; customer: string; note: string; vatMode: VatMode; lines: SaleLineInput[] }) =>
    unwrap(
      await supabase.rpc('post_sale', {
        p_sold_at: a.soldAt,
        p_customer: a.customer || null,
        p_note: a.note || null,
        p_vat_mode: a.vatMode,
        p_lines: a.lines,
      }),
    ),
  )

export const usePostAdjustment = () =>
  useStockMutation(async (a: { adjustedAt: string; note: string; lines: AdjustmentLineInput[] }) =>
    unwrap(await supabase.rpc('post_adjustment', { p_adjusted_at: a.adjustedAt, p_note: a.note || null, p_lines: a.lines })),
  )

export const usePostTransfer = () =>
  useStockMutation(async (a: { transferredAt: string; note: string; lines: TransferLineInput[] }) =>
    unwrap(await supabase.rpc('post_transfer', { p_transferred_at: a.transferredAt, p_note: a.note || null, p_lines: a.lines })),
  )

export const useVoidSale = () =>
  useStockMutation(async (a: { id: string; reason: string }) =>
    unwrap(await supabase.rpc('void_sale', { p_id: a.id, p_reason: a.reason || null })),
  )
export const useVoidAdjustment = () =>
  useStockMutation(async (a: { id: string; reason: string }) =>
    unwrap(await supabase.rpc('void_adjustment', { p_id: a.id, p_reason: a.reason || null })),
  )
export const useVoidTransfer = () =>
  useStockMutation(async (a: { id: string; reason: string }) =>
    unwrap(await supabase.rpc('void_transfer', { p_id: a.id, p_reason: a.reason || null })),
  )
