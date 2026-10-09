import { Plus } from 'lucide-react'
import { useState } from 'react'

const MAX = 500

/** ปุ่มเพิ่มแถวแบบระบุจำนวน: พิมพ์จำนวนแล้วกด Enter หรือกดปุ่ม */
export function AddRows({ onAdd, defaultCount = 5 }: { onAdd: (n: number) => void; defaultCount?: number }) {
  const [count, setCount] = useState(String(defaultCount))
  const n = Math.min(MAX, Math.max(1, Math.floor(Number(count)) || 0))
  const valid = Number(count) >= 1

  return (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-line-strong bg-surface text-sm focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/20">
      <button
        type="button"
        disabled={!valid}
        onClick={() => onAdd(n)}
        className="inline-flex items-center gap-1.5 px-2.5 font-medium hover:bg-surface-2 disabled:text-muted"
      >
        <Plus className="size-4" /> เพิ่ม
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX}
        value={count}
        aria-label="จำนวนแถวที่จะเพิ่ม"
        onChange={(e) => setCount(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setCount(String(valid ? n : defaultCount))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && valid) onAdd(n)
        }}
        className="w-14 border-x border-line bg-surface-2 text-center tabular-nums outline-none"
      />
      <span className="flex items-center px-2.5 text-ink-2">แถว</span>
    </div>
  )
}
