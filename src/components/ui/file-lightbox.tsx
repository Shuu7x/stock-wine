import { ChevronLeft, ChevronRight, Download, FileText, Trash2, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export type LightboxItem = { url: string | null | undefined; name: string; isImage: boolean }

/** ดูรูป/ไฟล์แนบเต็มจอ · ← → เลื่อน · Esc ปิด · ลบได้ถ้าส่ง onDelete */
export function FileLightbox({
  items,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  items: LightboxItem[]
  index: number | null
  onIndex: (i: number) => void
  onClose: () => void
  onDelete?: (i: number) => void
}) {
  const open = index != null && index < items.length
  const n = items.length

  useEffect(() => {
    if (!open) return
    // ดักก่อน (capture) ไม่ให้ Esc ไปปิด drawer/dialog ที่อยู่ข้างใต้ด้วย
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation()
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && n > 1) onIndex((index! - 1 + n) % n)
      else if (e.key === 'ArrowRight' && n > 1) onIndex((index! + 1) % n)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, index, n, onIndex, onClose])

  if (!open) return null
  const it = items[index]
  const navBtn = 'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25'

  return createPortal(
    <div className="fixed inset-0 z-[90] flex animate-[fade-in_150ms_ease-out] flex-col bg-black/85" role="dialog" aria-modal="true" aria-label={it.name}>
      <div className="flex shrink-0 items-center gap-2 px-4 py-3 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.name}</span>
        {n > 1 && (
          <span className="text-xs text-white/70 tabular-nums">
            {index + 1} / {n}
          </span>
        )}
        {it.url && (
          <a href={it.url} download={it.name} className="rounded-lg p-2 hover:bg-white/15" title="ดาวน์โหลด" aria-label="ดาวน์โหลด">
            <Download className="size-5" />
          </a>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(index)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm hover:bg-danger-600"
            title="ลบไฟล์นี้"
          >
            <Trash2 className="size-4" /> ลบ
          </button>
        )}
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/15" aria-label="ปิด">
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {!it.url ? (
          <span className="text-sm text-white/70">กำลังโหลด…</span>
        ) : it.isImage ? (
          <img src={it.url} alt={it.name} className="max-h-full max-w-full rounded-md object-contain shadow-2xl" />
        ) : (
          <div className="flex h-full w-full max-w-4xl flex-col items-center justify-center gap-3">
            <iframe src={it.url} title={it.name} className="min-h-0 w-full flex-1 rounded-md bg-white" />
            <a href={it.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
              <FileText className="size-4" /> เปิดในแท็บใหม่
            </a>
          </div>
        )}
        {n > 1 && (
          <>
            <button type="button" aria-label="ก่อนหน้า" onClick={() => onIndex((index - 1 + n) % n)} className={cn(navBtn, 'left-3')}>
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" aria-label="ถัดไป" onClick={() => onIndex((index + 1) % n)} className={cn(navBtn, 'right-3')}>
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
