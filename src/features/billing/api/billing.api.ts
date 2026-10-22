import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SaleWithLines } from '@/features/operations/api/operations.api'
import type { Store } from '@/features/stock/api/stock.api'
import { stockKeys } from '@/features/stock/api/stock.api'
import type { Tables } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import type { BillDoc } from '../components/Bill'

export type BillRow = Tables<'bills'>
export type BillGroup = { sale_ids: string[]; customer?: string | null; note?: string | null }

// 1 ใบขาย = 1 บิล (ออกตอนกดพิมพ์บิลครั้งแรก) · อยู่ใต้ 'ops' ให้รีเฟรชพร้อมเอกสารอื่น
export const billingKeys = {
  all: ['ops', 'billing'] as const,
  docs: (ids: string[]) => [...billingKeys.all, 'docs', ids] as const,
}

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
            customer_address: b.customer_address,
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


/** พิมพ์บิลของใบขาย: มีบิลแล้วใช้บิลเดิม · ยังไม่มีออกบิลให้ก่อน — คืน id บิล */
export function usePrintSaleBill() {
  const issue = useIssueBills()
  return {
    isPending: issue.isPending,
    billFor: async (sale: { id: string; bill_id?: string | null; customer?: string | null }) => {
      if (sale.bill_id) return sale.bill_id
      const bills = await issue.mutateAsync({ issuedAt: new Date().toISOString().slice(0, 10), groups: [{ sale_ids: [sale.id], customer: sale.customer }] })
      return bills[0].id
    },
  }
}
