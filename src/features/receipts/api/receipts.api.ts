import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Tables } from '@/lib/database.types'
import { applyDocFilter, type DocFilter } from '@/lib/doc-filter'
import { shrinkImage } from '@/lib/image'
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
  | 'rating'
  | 'wine_type'
  | 'region'
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
  list: (page: number, pageSize: number, f: DocFilter = {}) => [...receiptKeys.all, 'list', { page, pageSize, ...f }] as const,
}

async function fetchReceipts(page: number, pageSize: number, f: DocFilter) {
  const from = (page - 1) * pageSize
  const { data, count, error } = await applyDocFilter(
    supabase.from('receipts').select('*, receipt_lines(*)', { count: 'exact' }),
    'received_at',
    f,
  )
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return { items: data as ReceiptWithLines[], total: count ?? 0 }
}

export const receiptsListOptions = (page: number, pageSize = 20, f: DocFilter = {}) =>
  queryOptions({
    queryKey: receiptKeys.list(page, pageSize, f),
    queryFn: () => fetchReceipts(page, pageSize, f),
    placeholderData: keepPreviousData,
  })

export const RECEIPT_BUCKET = 'receipt-files'

export type ReceiptAttachment = Tables<'receipt_attachments'>

/** ไฟล์แนบของใบรับเข้า (รูปบิล) */
export const receiptAttachmentsOptions = (receiptId: string) =>
  queryOptions({
    queryKey: [...receiptKeys.all, 'attachments', receiptId] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('receipt_attachments').select('*').eq('receipt_id', receiptId).order('created_at')
      if (error) throw error
      return data
    },
    staleTime: Infinity,
  })

/** ดาวน์โหลดไฟล์แนบเป็น URL ชั่วคราว (bucket ส่วนตัว) */
export async function attachmentUrl(path: string) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).download(path)
  if (error) throw error
  return URL.createObjectURL(data)
}

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

export function usePostReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      receivedAt: string
      note: string
      supplier: string
      purchaseDate: string | null
      lines: ReceiptLineInput[]
      files: File[]
    }) => {
      // อัปโหลดรูปบิลก่อน แล้วส่งตำแหน่งไฟล์ไปพร้อมใบรับเข้า
      const attachments = []
      for (const original of input.files) {
        const file = await shrinkImage(original)
        const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${safeName(file.name)}`
        const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type || undefined })
        if (error) throw new Error(`อัปโหลด ${original.name} ไม่สำเร็จ: ${error.message}`)
        attachments.push({ path, file_name: original.name, mime_type: file.type || null, size_bytes: file.size })
      }
      const { data, error } = await supabase.rpc('post_receipt', {
        p_received_at: input.receivedAt,
        p_note: input.note || null,
        p_lines: input.lines,
        p_supplier: input.supplier.trim() || null,
        p_purchase_date: input.purchaseDate,
        p_attachments: attachments,
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
