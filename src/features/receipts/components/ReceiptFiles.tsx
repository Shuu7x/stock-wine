import { useQueries, useQuery } from '@tanstack/react-query'
import { FileText, Paperclip } from 'lucide-react'
import { attachmentUrl, receiptAttachmentsOptions } from '../api/receipts.api'

/** รูปบิล/ไฟล์แนบของใบรับเข้า — แตะเพื่อเปิดดูเต็มในแท็บใหม่ */
export function ReceiptFiles({ receiptId }: { receiptId: string }) {
  const q = useQuery(receiptAttachmentsOptions(receiptId))
  const files = q.data ?? []
  const urls = useQueries({
    queries: files.map((f) => ({
      queryKey: ['receipt-file', f.path],
      queryFn: () => attachmentUrl(f.path),
      staleTime: Infinity,
      gcTime: 10 * 60_000,
    })),
  })
  if (!files.length) return null
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Paperclip className="size-4" /> รูปบิล / ไฟล์แนบ ({files.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => {
          const url = urls[i]?.data
          const isImage = f.mime_type?.startsWith('image/')
          return (
            <a
              key={f.id}
              href={url}
              target="_blank"
              rel="noreferrer"
              title={f.file_name}
              className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 hover:border-brand-400"
            >
              {url && isImage ? (
                <img src={url} alt={f.file_name} className="size-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 px-1 text-center text-muted">
                  <FileText className="size-6" />
                  <span className="w-full truncate text-[10px]">{url ? f.file_name : 'กำลังโหลด…'}</span>
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
