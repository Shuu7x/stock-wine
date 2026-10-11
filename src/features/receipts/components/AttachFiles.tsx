import { FileText, ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'

const MAX_FILES = 10
const MAX_BYTES = 15 * 1024 * 1024

/** แนบรูปบิล/ใบส่งของ (เลือกหลายไฟล์ · ถ่ายจากกล้องมือถือได้) พร้อมรูปย่อ */
export function AttachFiles({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="group relative size-14 overflow-hidden rounded-lg border border-line bg-surface-2" title={f.name}>
          {previews[i] ? (
            <img src={previews[i]!} alt={f.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-0.5 text-muted">
              <FileText className="size-5" />
              <span className="max-w-full truncate px-1 text-[9px]">{f.name}</span>
            </div>
          )}
          <button
            type="button"
            aria-label={`เอา ${f.name} ออก`}
            onClick={() => onChange(files.filter((_, j) => j !== i))}
            className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-ink/70 text-white"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {files.length < MAX_FILES && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-14 items-center gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/50 px-3 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
        >
          <ImagePlus className="size-5" />
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
    </div>
  )
}
