import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SaleWithLines } from '@/features/operations/api/operations.api'
import type { Store } from '@/features/stock/api/stock.api'
import { stockKeys } from '@/features/stock/api/stock.api'
import type { Tables } from '@/lib/database.types'
import { applyDocFilter, type DocFilter } from '@/lib/doc-filter'
import { supabase } from '@/lib/supabase'
import type { BillDoc } from '../components/Bill'

export type BillRow = Tables<'bills'>
export type BillGroup = { sale_ids: string[]; customer?: string | null; note?: string | null }

// อยู่ใต้ 'ops' — mutation ขาย/ยกเลิกขาย invalidate ['ops'] อยู่แล้ว รายการรอออกบิลจึงอัปเดตเอง
export const billingKeys = {
  all: ['ops', 'billing'] as const,
  unbilled: () => [...billingKeys.all, 'unbilled'] as const,
  list: (page: number, size: number, f: DocFilter) => [...billingKeys.all, 'list', { page, size, ...f }] as const,
  docs: (ids: string[]) => [...billingKeys.all, 'docs', ids] as const,
}

/** ใบขายที่ยังไม่ออกบิล (ไม่รวมที่ยกเลิก) */
export const unbilledSalesOptions = () =>
  queryOptions({
    queryKey: billingKeys.unbilled(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('*, sale_lines(*)')
        .eq('status', 'posted')
        .is('bill_id', null)
        .order('sold_at')
        .order('created_at')
        .limit(1000)
      if (error) throw error
      return data as SaleWithLines[]
    },
  })

/** บิลที่ออกแล้ว พร้อมจำนวนใบขายในแต่ละบิล */
export const billsListOptions = (page: number, size = 20, f: DocFilter = {}) =>
  queryOptions({
    queryKey: billingKeys.list(page, size, f),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * size
      const { data, count, error } = await applyDocFilter(
        supabase.from('bills').select('*', { count: 'exact' }),
        'issued_at',
        f,
      )
        .order('created_at', { ascending: false })
        .range(from, from + size - 1)
      if (error) throw error
      const ids = data.map((b) => b.id)
      const links = ids.length ? await supabase.from('bill_sales').select('bill_id, sale_id').in('bill_id', ids) : { data: [], error: null }
      if (links.error) throw links.error
      const count_ = new Map<string, number>()
      for (const l of links.data ?? []) count_.set(l.bill_id, (count_.get(l.bill_id) ?? 0) + 1)
      return { items: data.map((b) => ({ ...b, sale_count: count_.get(b.id) ?? 0 })), total: count ?? 0 }
    },
  })

/** ข้อมูลสำหรับพิมพ์บิล (หลายใบได้) — รวมรายการของทุกใบขายในบิล */
export const billDocsOptions = (ids: string[], stores: Store[]) =>
  queryOptions({
    queryKey: [...billingKeys.docs(ids), stores.length] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<Array<BillDoc & { id: string }>> => {
      const bills = await supabase.from('bills').select('*').in('id', ids)
      if (bills.error) throw bills.error
      const links = await supabase.from('bill_sales').select('bill_id, sale_id').in('bill_id', ids)
      if (links.error) throw links.error
      const saleIds = [...new Set(links.data.map((l) => l.sale_id))]
      const sales = saleIds.length
        ? await supabase.from('sales').select('*, sale_lines(*)').in('id', saleIds).order('sold_at').order('created_at')
        : { data: [], error: null }
      if (sales.error) throw sales.error
      const code = (id: number) => stores.find((s) => s.id === id)?.code ?? ''

      // เรียงตามลำดับ ids ที่ส่งมา (เช่น ลำดับที่เพิ่งออกบิล)
      return ids
        .map((id) => bills.data.find((b) => b.id === id))
        .filter((b): b is BillRow => !!b)
        .map((b) => {
          const mine = (sales.data as SaleWithLines[]).filter((s) => links.data.some((l) => l.bill_id === b.id && l.sale_id === s.id))
          const modes = new Set(mine.map((s) => s.vat_mode))
          return {
            id: b.id,
            doc_no: b.bill_no,
            sold_at: b.issued_at,
            customer: b.customer,
            note: b.note,
            status: b.status,
            vat_mode: modes.size === 1 ? [...modes][0] : 'included',
            vat_rate: mine[0]?.vat_rate ?? 7,
            subtotal: b.subtotal,
            vat_amount: b.vat_amount,
            total: b.total,
            created_by_email: b.created_by_email,
            ref: mine.map((s) => s.doc_no).join(', '),
            lines: mine.flatMap((s) =>
              [...s.sale_lines]
                .sort((x, y) => x.line_no - y.line_no)
                .map((l) => ({ ...l, store_code: code(l.store_id) })),
            ),
          }
        })
    },
  })

function useBillingMutation<A, T>(fn: (a: A) => Promise<T>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ops'] })
      qc.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

export const useIssueBills = () =>
  useBillingMutation(async (a: { issuedAt: string; groups: BillGroup[] }) => {
    const { data, error } = await supabase.rpc('issue_bills', { p_issued_at: a.issuedAt, p_groups: a.groups })
    if (error) throw error
    return data as BillRow[]
  })

export const useVoidBill = () =>
  useBillingMutation(async (a: { id: string; reason: string }) => {
    const { data, error } = await supabase.rpc('void_bill', { p_id: a.id, p_reason: a.reason || null })
    if (error) throw error
    return data
  })
