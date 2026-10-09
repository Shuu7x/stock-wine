import { ArrowDownAZ, ArrowUpAZ, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { Floating } from './floating'

/** เมนูหัวคอลัมน์แบบ Excel: เรียง · ค้นหา · ติ๊กเลือกค่า */
export function FilterMenu({
  anchor,
  title,
  values,
  selected,
  sort,
  onSort,
  onApply,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>
  title: string
  /** ค่าทั้งหมดในคอลัมน์ + จำนวน */
  values: Array<{ value: string; count: number }>
  /** null = ไม่กรอง (เลือกทั้งหมด) */
  selected: string[] | null
  sort: 'asc' | 'desc' | null
  onSort: (dir: 'asc' | 'desc' | null) => void
  onApply: (selected: string[] | null) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(selected ?? values.map((v) => v.value)),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (anchor.current?.contains(t) || t.closest?.('[data-floating]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [anchor, onClose])

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return ql ? values.filter((v) => v.value.toLowerCase().includes(ql)) : values
  }, [q, values])

  const allVisibleChecked = visible.length > 0 && visible.every((v) => checked.has(v.value))

  function toggleAll() {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const v of visible) {
        if (allVisibleChecked) next.delete(v.value)
        else next.add(v.value)
      }
      return next
    })
  }

  function apply() {
    // พิมพ์ค้นหาแล้วกดตกลง = กรองเฉพาะค่าที่ค้นเจอและติ๊กไว้ (แบบ Excel)
    const pool = q.trim() ? visible : values
    const picked = pool.filter((v) => checked.has(v.value)).map((v) => v.value)
    onApply(picked.length === values.length ? null : picked)
    onClose()
  }

  const sortBtn = (dir: 'asc' | 'desc') =>
    cn(
      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2',
      sort === dir && 'bg-brand-50 font-medium text-brand-800',
    )

  return (
    <Floating
      anchor={anchor}
      width={270}
      maxHeight={440}
      className="flex flex-col rounded-xl border border-line bg-surface p-2 text-ink shadow-2xl"
    >
      <div className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">{title}</div>
      <button type="button" className={sortBtn('asc')} onClick={() => onSort(sort === 'asc' ? null : 'asc')}>
        <ArrowDownAZ className="size-4" /> เรียง น้อย → มาก
      </button>
      <button type="button" className={sortBtn('desc')} onClick={() => onSort(sort === 'desc' ? null : 'desc')}>
        <ArrowUpAZ className="size-4" /> เรียง มาก → น้อย
      </button>
      <div className="my-2 border-t border-line" />
      <label className="relative mb-2 block">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') apply()
            if (e.key === 'Escape') onClose()
          }}
          placeholder="ค้นหาค่า…"
          className="h-9 w-full rounded-md border border-line bg-surface pr-2 pl-8 text-sm outline-none focus:border-brand-600"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-line">
        <label className="flex cursor-pointer items-center gap-2 border-b border-line bg-surface-2 px-2 py-1.5 text-sm font-medium">
          <input type="checkbox" className="accent-brand-700" checked={allVisibleChecked} onChange={toggleAll} />
          (เลือกทั้งหมด)
        </label>
        {visible.map((v) => (
          <label key={v.value} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-surface-2">
            <input
              type="checkbox"
              className="accent-brand-700"
              checked={checked.has(v.value)}
              onChange={() =>
                setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(v.value)) next.delete(v.value)
                  else next.add(v.value)
                  return next
                })
              }
            />
            <span className="min-w-0 flex-1 truncate">{v.value}</span>
            <span className="text-xs text-muted tabular-nums">{v.count}</span>
          </label>
        ))}
        {visible.length === 0 && <div className="px-2 py-4 text-center text-sm text-muted">ไม่พบค่า</div>}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="h-9 flex-1 rounded-md border border-line text-sm hover:bg-surface-2"
          onClick={() => {
            onApply(null)
            onClose()
          }}
        >
          ล้างตัวกรอง
        </button>
        <button
          type="button"
          className="h-9 flex-1 rounded-md bg-brand-700 text-sm font-medium text-white hover:bg-brand-800"
          onClick={apply}
        >
          ตกลง
        </button>
      </div>
    </Floating>
  )
}
