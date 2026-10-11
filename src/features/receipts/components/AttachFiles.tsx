import { FileText, ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileLightbox } from '@/components/ui/file-lightbox'

const MAX_FILES = 10
const MAX_BYTES = 15 * 1024 * 1024

/** แนบรูปบิล/ใบส่งของ (เลือกหลายไฟล์ · ถ่ายจากกล้องมือถือได้) · รูปย่อเล็ก แตะเพื่อดูเต็มจอ · × เพื่อลบ */
export function AttachFiles({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  // PDF ก็ใช้ object URL เพื่อพรีวิวได้
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  function add(list: FileList | null) {
    if (!list) return
    const picked = [...list].filter((f) => {
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} ใหญ่เกิน 15 MB`)
        return false
      }
      return f.type.startsWith('image/') || f.type === 'application/pdf'
    })
    const next = [...files, ...picked].slice(0, MAX_FILES)
    if (files.length + picked.length > MAX_FILES) toast.info(`แนบได้สูงสุด ${MAX_FILES} ไฟล์`)
    onChange(next)
  }

  function remove(i: number) {
    const next = files.filter((_, j) => j !== i)
    onChange(next)
    // ลบจากหน้าพรีวิว: ไปไฟล์ถัดไป หรือปิดถ้าไม่เหลือ
    setViewing((v) => (v == null || !next.length ? null : Math.min(v, next.length - 1)))
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5">
      {files.map((f, i) => {
        const isImage = f.type.startsWith('image/')
        return (
          <div key={`${f.name}-${i}`} className="group relative">
            <button
              type="button"
              onClick={() => setViewing(i)}
              title={`ดู ${f.name}`}
              className="flex size-10 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2 transition hover:border-brand-500 hover:ring-2 hover:ring-brand-600/20"
            >
              {isImage ? <img src={urls[i]} alt={f.name} className="size-full object-cover" /> : <FileText className="size-5 text-muted" />}
            </button>
            <button
              type="button"
              aria-label={`ลบ ${f.name}`}
              title="ลบ"
              onClick={() => remove(i)}
              className="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-ink text-white shadow ring-2 ring-surface transition hover:bg-danger-600"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
      {files.length < MAX_FILES && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-10 items-center gap-1.5 rounded-md border border-dashed border-brand-300 bg-brand-50/50 px-2.5 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          <ImagePlus className="size-4" />
          {files.length ? 'เพิ่ม' : 'แนบรูปบิล'}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
      <FileLightbox
        items={files.map((f, i) => ({ url: urls[i], name: f.name, isImage: f.type.startsWith('image/') }))}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        onDelete={remove}
      />
    </div>
  )
}
