import { ArrowDownUp, Check, ChevronRight, Filter, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import { cn } from '@/lib/cn'
import type { DataGridProps } from './DataGrid'
import { FilterChips, pickedText, type FilterChip } from '@/components/ui/filter-chips'
import type { CellValue, GridColumn, SortState } from './types'
import { BLANK_LABEL, filterText, formatValue, getOptions, getValue, isReadOnly, parseText, setValue, sortComparator, toggleSort, inYearRange, asYear } from './utils'

const CHUNK = 30

/** แถวว่าง (ยังไม่กรอกอะไร) — ซ่อนไว้ในมุมมองการ์ด */
function defaultIsBlank<R>(columns: GridColumn<R>[], row: R) {
  return columns.every((c) => {
    if (isReadOnly(c, row) && !c.suggest) return true
    if (c.type === 'select') return true // ค่าตั้งต้นจากรายการ (เช่น มี VAT) ไม่นับ
    return formatValue(c, row) === ''
  })
}

/**
 * มุมมองการ์ดสำหรับจอมือถือ (แทนตารางแบบ Excel)
 * - การ์ดละแถว: ชื่อ · รายละเอียด · ค่าสำคัญ · สีสถานะ (เพิ่มใหม่/แก้ไข/ลบ/ผิดพลาด)
 * - แตะการ์ด = แผ่นแก้ไขจากด้านล่าง สร้างช่องกรอกจากคอลัมน์ (ค้นหาไวน์ · ตัวเลือก · วันที่ · ตัวเลข)
 * - ค้นหา · เรียง · กรอง · แสดงทีละ 30 รายการ
 */
export function CardList<R>({
  rows,
  columns,
  getRowId,
  onRowsChange,
  createRow,
  onDeleteRows,
  onSelectionChange,
  cellError,
  rowStatus,
  cellChanged,
  search,
  emptyState,
  card,
  onClearSearch,
  onViewChange,
}: DataGridProps<R>) {
  // ไม่ใช้ className ของตาราง (มักเป็น flex-1/ความสูงขั้นต่ำ) — การ์ดสูงตามเนื้อหา ให้หน้าเลื่อนทั้งหน้าแทน
  const editable = !!onRowsChange
  const isBlank = (r: R) => (card?.isBlank ? card.isBlank(r) : defaultIsBlank(columns, r))
  const titleCol = columns.find((c) => c.suggest) ?? columns[0]

  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortState>([])
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [years, setYears] = useState<Record<string, number>>({})
  const [sheet, setSheet] = useState<null | 'filter' | 'sort'>(null)
  const [limit, setLimit] = useState(CHUNK)
  const [editId, setEditId] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const query = `${search ?? ''} ${q}`.trim().toLowerCase()
  const isDoc = !!createRow
  const showSearch = !isDoc && search === undefined
  const view = useMemo(() => {
    let list = rows.filter((r) => !isBlank(r) || getRowId(r) === editId)
    for (const [key, allowed] of Object.entries(filters)) {
      const col = columns.find((c) => c.key === key)
      if (!col || !allowed.length) continue
      const set = new Set(allowed)
      list = list.filter((r) => set.has(filterText(col, r)))
    }
    for (const [key, y] of Object.entries(years)) {
      const col = columns.find((c) => c.key === key)
      if (col?.yearRange) list = list.filter((r) => inYearRange(col.yearRange!(r), y))
    }
    if (query) {
      const words = query.split(/\s+/)
      list = list.filter((r) => {
        const hay = columns.map((c) => `${formatValue(c, r)} ${c.filterValue?.(r) ?? ''}`).join(' ').toLowerCase()
        return words.every((w) => hay.includes(w))
      })
    }
    const cmp = sortComparator(columns, sort)
    if (cmp) list = [...list].sort(cmp)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, years, query, sort, columns, editId])

  useEffect(() => setLimit(CHUNK), [query, filters, years, sort])
  const filterActive = !!query || Object.values(filters).some((v) => v.length) || Object.keys(years).length > 0
  const viewSig = filterActive ? view.map(getRowId).join('|') : null
  useEffect(() => {
    onViewChange?.(viewSig == null ? null : viewSig ? viewSig.split('|') : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSig])
  useEffect(() => onSelectionChange?.([...picked]), [picked, onSelectionChange])
  // แถวที่เลือกไว้แต่หายไปแล้ว (ลบ/บันทึก) ไม่ต้องค้าง
  useEffect(() => {
    const ids = new Set(rows.map(getRowId))
    setPicked((p) => (([...p].every((id) => ids.has(id)) ? p : new Set([...p].filter((id) => ids.has(id))))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const filterCols = columns.filter((c) => c.filterable !== false && (c.filterValue || c.type === 'select' || c.options || c.key === 'country' || c.key === 'store_id'))
  const sortCols = columns.filter((c) => !c.render || c.get)
  const nFilters = Object.values(filters).filter((v) => v.length).length + Object.keys(years).length
  const chips: FilterChip[] = []
  if (q.trim()) chips.push({ key: 'q', label: 'ค้นหา', value: `“${q.trim()}”`, onRemove: () => setQ('') })
  else if (search?.trim() && onClearSearch) chips.push({ key: 'q', label: 'ค้นหา', value: `“${search.trim()}”`, onRemove: onClearSearch })
  for (const [key, picked] of Object.entries(filters)) {
    const col = columns.find((c) => c.key === key)
    if (!col || !picked.length) continue
    chips.push({
      key: `f:${key}`,
      label: col.title,
      value: pickedText(picked, []),
      onRemove: () => setFilters(({ [key]: _, ...rest }) => rest),
    })
  }
  for (const [key, y] of Object.entries(years))
    chips.push({
      key: `y:${key}`,
      label: columns.find((c) => c.key === key)?.title ?? key,
      value: `ครอบคลุมปี ${y}`,
      onRemove: () => setYears(({ [key]: _, ...rest }) => rest),
    })
  sort.forEach((st, i) =>
    chips.push({
      key: `s:${st.key}`,
      label: sort.length > 1 ? `เรียง ${i + 1}` : 'เรียง',
      value: `${columns.find((c) => c.key === st.key)?.title ?? st.key} ${st.dir === 'asc' ? '↑' : '↓'}`,
      onRemove: () => setSort((v) => toggleSort(v, st.key, null)),
    }),
  )
  const clearAll = () => {
    setQ('')
    setFilters({})
    setYears({})
    setSort([])
    onClearSearch?.()
  }
  const editing = editId ? rows.find((r) => getRowId(r) === editId) ?? null : null

  function addRow() {
    if (!createRow || !onRowsChange) return
    // ใช้แถวว่างที่มีอยู่ก่อน (หน้าเอกสารเริ่มด้วยแถวว่างหลายแถว) — ลำดับจะตรงกับตารางบนจอใหญ่
    const blank = rows.find(isBlank)
    if (blank) return setEditId(getRowId(blank))
    const r = createRow()
    onRowsChange([...rows, r])
    setEditId(getRowId(r))
  }

  // ปุ่มเรียง/กรอง (หน้าเอกสารไม่ต้องมี)
  const tools = isDoc ? null : (
    <>
      <button
        type="button"
        onClick={() => setSheet('sort')}
        aria-label="เรียงลำดับ"
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border', sort.length ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line-strong bg-surface text-ink-2')}
      >
        <ArrowDownUp className="size-4" />
      </button>
      {filterCols.length > 0 && (
        <button
          type="button"
          onClick={() => setSheet('filter')}
          aria-label="ตัวกรอง"
          className={cn(
            'relative flex size-10 shrink-0 items-center justify-center rounded-lg border',
            nFilters ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line-strong bg-surface text-ink-2',
          )}
        >
          <Filter className="size-4" />
          {nFilters > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-brand-700 text-[11px] font-semibold text-white">{nFilters}</span>
          )}
        </button>
      )}
    </>
  )

  const fields = card?.fields ?? columns.filter((c) => c !== titleCol).slice(0, 4).map((c) => c.key)

  return (
    <div className="flex shrink-0 flex-col gap-3">
      {/* ค้นหา + เรียง/กรอง (เฉพาะตารางที่ไม่มีช่องค้นหาของหน้าเอง และไม่ใช่หน้าเอกสาร) */}
      {showSearch && (
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`ค้นหา${card?.noun ?? 'รายการ'}…`}
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
          </label>
          {tools}
        </div>
      )}

      <FilterChips chips={chips} onClearAll={clearAll} />

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {view.length.toLocaleString('th-TH')} {card?.noun ?? 'รายการ'}
          {picked.size > 0 && (
            <>
              {' '}
              · เลือก {picked.size}{' '}
              <button type="button" className="font-medium text-brand-700" onClick={() => setPicked(new Set())}>
                ล้าง
              </button>
            </>
          )}
        </span>
        {!showSearch && tools && <span className="flex gap-2">{tools}</span>}
        {createRow && editable && view.length > 0 && (
          <Button size="sm" variant="primary" onClick={addRow}>
            <Plus className="size-4" /> เพิ่ม{card?.noun ?? 'รายการ'}
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {view.slice(0, limit).map((r) => {
          const id = getRowId(r)
          const st = rowStatus?.(r)
          const changed = !st && cellChanged && columns.some((c) => cellChanged(r, c.key))
          const errs = cellError ? columns.map((c) => cellError(r, c.key)).filter(Boolean) : []
          const on = picked.has(id)
          return (
            <li
              key={id}
              className={cn(
                'relative flex items-stretch overflow-hidden rounded-xl border bg-surface transition',
                errs.length ? 'border-danger-600/60' : on ? 'border-brand-500' : 'border-line',
                st === 'deleted' && 'opacity-60',
              )}
            >
              {/* แถบสีสถานะ */}
              <span
                aria-hidden
                className={cn(
                  'w-1 shrink-0',
                  st === 'added' ? 'bg-success-600' : st === 'deleted' ? 'bg-danger-600' : changed ? 'bg-warning-600' : errs.length ? 'bg-danger-600' : 'bg-transparent',
                )}
              />
              {onSelectionChange && (
                <label className="flex shrink-0 items-start pt-3.5 pl-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-700"
                    checked={on}
                    aria-label="เลือก"
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p)
                        if (e.target.checked) n.add(id)
                        else n.delete(id)
                        return n
                      })
                    }
                  />
                </label>
              )}
              <button type="button" onClick={() => setEditId(id)} className="flex min-w-0 flex-1 items-start gap-2 p-3 text-left">
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate font-semibold', st === 'deleted' && 'line-through')}>
                    {card?.title ? card.title(r) : formatValue(titleCol, r) || <span className="text-muted">(ยังไม่ได้เลือก)</span>}
                  </div>
                  {card?.subtitle && <div className="truncate text-xs text-muted">{card.subtitle(r)}</div>}
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                    {fields.map((k) => {
                      const c = columns.find((x) => x.key === k)
                      if (!c) return null
                      const text = formatValue(c, r)
                      if (!text && !c.render) return null
                      return (
                        <div key={k} className="flex min-w-0 gap-1">
                          <dt className="shrink-0 text-muted">{c.title}</dt>
                          <dd className={cn('min-w-0 truncate font-medium', cellChanged?.(r, k) && 'text-warning-700')}>{c.render ? c.render(r) : text}</dd>
                        </div>
                      )
                    })}
                  </dl>
                  {errs.length > 0 && <div className="mt-1 truncate text-xs text-danger-700">{errs[0]}</div>}
                </div>
                {card?.aside && <div className="shrink-0 text-right">{card.aside(r)}</div>}
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-line-strong" />
              </button>
            </li>
          )
        })}
      </ul>

      {view.length === 0 && (
        <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">
          {nFilters || query ? 'ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง' : (emptyState ?? 'ยังไม่มีข้อมูล')}
          {createRow && editable && !nFilters && !query && (
            <Button size="sm" variant="primary" className="mt-3" onClick={addRow}>
              <Plus className="size-4" /> เพิ่ม{card?.noun ?? 'รายการ'}
            </Button>
          )}
        </div>
      )}
      {view.length > limit && (
        <Button variant="ghost" onClick={() => setLimit((n) => n + CHUNK)}>
          แสดงเพิ่ม ({(view.length - limit).toLocaleString('th-TH')})
        </Button>
      )}

      {/* แผ่นแก้ไข */}
      {editing && (
        <RowSheet
          row={editing}
          columns={columns}
          editable={editable}
          title={card?.noun ?? 'รายการ'}
          cellError={cellError}
          actions={card?.actions?.(editing)}
          onClose={() => setEditId(null)}
          onSave={(next) => {
            onRowsChange?.(rows.map((r) => (getRowId(r) === editId ? next : r)))
            setEditId(null)
          }}
          onDelete={
            editable && (onDeleteRows || createRow)
              ? () => {
                  const id = editId!
                  if (onDeleteRows) onDeleteRows([id])
                  else onRowsChange?.(rows.filter((r) => getRowId(r) !== id))
                  setEditId(null)
                }
              : undefined
          }
        />
      )}

      {sheet === 'sort' && (
        <Sheet
          title="เรียงลำดับ"
          onClose={() => setSheet(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setSort([])} disabled={!sort.length}>
                ล้างการเรียง
              </Button>
              <Button className="flex-1" onClick={() => setSheet(null)}>
                ตกลง
              </Button>
            </>
          }
        >
          <p className="px-3 pb-2 text-xs text-muted">เลือกได้หลายคอลัมน์ · เรียงตามลำดับที่เลือก แตะซ้ำเพื่อเอาออก</p>
          <ul className="flex flex-col">
            {sortCols.flatMap((c) =>
              (['asc', 'desc'] as const).map((dir) => {
                const level = sort.findIndex((s) => s.key === c.key && s.dir === dir)
                return (
                  <SheetOption key={c.key + dir} on={level >= 0} onClick={() => setSort((v) => toggleSort(v, c.key, level >= 0 ? null : dir))}>
                    {level >= 0 && sort.length > 1 && (
                      <b className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-brand-700 text-[11px] text-white">{level + 1}</b>
                    )}
                    {c.title} <span className="text-muted">{dir === 'asc' ? 'น้อย → มาก' : 'มาก → น้อย'}</span>
                  </SheetOption>
                )
              }),
            )}
          </ul>
        </Sheet>
      )}

      {sheet === 'filter' && (
        <Sheet
          title="ตัวกรอง"
          onClose={() => setSheet(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => (setFilters({}), setYears({}))} disabled={!nFilters}>
                ล้างตัวกรอง
              </Button>
              <Button variant="primary" onClick={() => setSheet(null)}>
                ดู {view.length} {card?.noun ?? 'รายการ'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {filterCols.map((c) => {
              const values = [...new Set(rows.filter((r) => !isBlank(r)).map((r) => filterText(c, r)))]
                .sort((a, b) => (a === BLANK_LABEL ? 1 : b === BLANK_LABEL ? -1 : a.localeCompare(b, 'th', { numeric: true })))
                .slice(0, 40)
              if (values.length < 2) return null
              const cur = filters[c.key] ?? []
              return (
                <div key={c.key}>
                  <div className="mb-1.5 text-sm font-medium">{c.title}</div>
                  {c.yearRange && (
                    <label className="mb-2 flex items-center gap-2 text-sm">
                      <span className="shrink-0 text-ink-2">ครอบคลุมปี</span>
                      <input
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="เช่น 2030"
                        defaultValue={years[c.key] ?? ''}
                        onChange={(e) => {
                          const y = asYear(e.target.value)
                          setYears(({ [c.key]: _, ...rest }) => (y == null ? rest : { ...rest, [c.key]: y }))
                        }}
                        className="h-9 w-28 rounded-lg border border-line-strong bg-surface px-3 outline-none focus:border-brand-600"
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {values.map((v) => {
                      const on = cur.includes(v)
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setFilters((f) => ({ ...f, [c.key]: on ? cur.filter((x) => x !== v) : [...cur, v] }))}
                          className={cn(
                            'rounded-full px-3 py-1 text-sm transition',
                            on ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset',
                          )}
                        >
                          {v}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </Sheet>
      )}
    </div>
  )
}

function SheetOption({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm', on ? 'bg-brand-50 font-medium text-brand-800' : 'hover:bg-surface-2')}>
        <span className="flex-1">{children}</span>
        {on && <Check className="size-4 text-brand-700" />}
      </button>
    </li>
  )
}

/** แผ่นเลื่อนขึ้นจากด้านล่าง */
export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-ink/40 animate-[fade-in_0.15s_ease-out]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[88vh] flex-col rounded-t-2xl bg-surface shadow-2xl animate-[sheet-up_0.2s_ease-out]">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-2 pb-3">
          <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="ปิด" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** แผ่นแก้ไขหนึ่งแถว: ช่องกรอกตามชนิดคอลัมน์ */
function RowSheet<R>({
  row,
  columns,
  editable,
  title,
  cellError,
  actions,
  onClose,
  onSave,
  onDelete,
}: {
  row: R
  columns: GridColumn<R>[]
  editable: boolean
  title: string
  cellError?: (row: R, key: string) => string | null | undefined
  actions?: ReactNode
  onClose: () => void
  onSave: (row: R) => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState(row)
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [bad, setBad] = useState<Record<string, boolean>>({})

  // ค่าที่พิมพ์ค้างไว้ → แปลงเป็นแถว (ไม่ถูกต้อง = คืน null)
  function resolve(): R | null {
    let next = draft
    const wrong: Record<string, boolean> = {}
    for (const [key, text] of Object.entries(texts)) {
      const col = columns.find((c) => c.key === key)!
      const v = parseText(col, text, next)
      if (v === undefined) wrong[key] = true
      else next = setValue(col, next, v)
    }
    setBad(wrong)
    return Object.keys(wrong).length ? null : next
  }

  const preview = useMemo(() => {
    let next = draft
    for (const [key, text] of Object.entries(texts)) {
      const col = columns.find((c) => c.key === key)!
      const v = parseText(col, text, next)
      if (v !== undefined) next = setValue(col, next, v)
    }
    return next
  }, [draft, texts, columns])

  const set = (col: GridColumn<R>, v: CellValue) => {
    setDraft((d) => setValue(col, d, v))
    setTexts(({ [col.key]: _, ...rest }) => rest)
  }

  return (
    <Sheet
      title={editable ? `แก้ไข${title}` : title}
      onClose={onClose}
      footer={
        editable ? (
          <>
            {onDelete && (
              <Button variant="ghost" className="mr-auto text-danger-700" onClick={onDelete}>
                <Trash2 className="size-4" /> ลบ
              </Button>
            )}
            <Button onClick={onClose}>ยกเลิก</Button>
            <Button
              variant="primary"
              onClick={() => {
                const next = resolve()
                if (next) onSave(next)
              }}
            >
              <Check className="size-4" /> ตกลง
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3.5">
        {actions}
        {[...columns.filter((c) => c.suggest), ...columns.filter((c) => !c.suggest)].map((col) => {
          const ro = !editable || isReadOnly(col, preview)
          if (ro && !formatValue(col, preview) && !col.render?.(preview)) return null
          const err = bad[col.key] ? 'รูปแบบไม่ถูกต้อง' : cellError?.(preview, col.key)
          return (
            <div key={col.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-2">
                {col.title}
                {col.subtitle && <span className="font-normal text-muted"> · {col.subtitle}</span>}
              </span>
              {ro ? (
                <div className="min-h-10 rounded-lg bg-surface-2 px-3 py-2 text-sm">{col.render ? col.render(preview) : formatValue(col, preview) || '–'}</div>
              ) : (
                <FieldInput col={col} row={preview} text={texts[col.key]} onText={(t) => setTexts((x) => ({ ...x, [col.key]: t }))} onValue={(v) => set(col, v)} onApply={(r) => (setDraft(r), setTexts({}))} />
              )}
              {err && <span className="text-xs text-danger-700">{err}</span>}
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

const inputCls =
  'h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'

function FieldInput<R>({
  col,
  row,
  text,
  onText,
  onValue,
  onApply,
}: {
  col: GridColumn<R>
  row: R
  text: string | undefined
  onText: (t: string) => void
  onValue: (v: CellValue) => void
  onApply: (r: R) => void
}) {
  const shown = text ?? formatValue(col, row)
  const listId = useRef(`opts-${Math.random().toString(36).slice(2)}`).current

  // ค้นหาแบบละเอียด (เช่น เลือกไวน์ แล้วเติมข้อมูลทั้งแถว)
  if (col.suggest) {
    return <SuggestField col={col} row={row} onApply={onApply} onText={onText} text={text} />
  }
  if (col.type === 'date') {
    const v = getValue(col, row)
    return <DateInput value={typeof v === 'string' ? v : ''} onChange={(iso) => onValue(iso)} />
  }
  const opts = getOptions(col, row)
  if (col.type === 'select') {
    return (
      <select className={inputCls} value={shown} onChange={(e) => onText(e.target.value)}>
        {!opts.includes(shown) && <option value={shown}>{shown || '–'}</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  return (
    <>
      <input
        className={inputCls}
        value={shown}
        placeholder={col.placeholder}
        inputMode={col.type === 'number' ? 'decimal' : undefined}
        list={opts.length ? listId : undefined}
        onChange={(e) => onText(e.target.value)}
      />
      {opts.length > 0 && (
        <datalist id={listId}>
          {opts.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  )
}

function SuggestField<R>({ col, row, text, onText, onApply }: { col: GridColumn<R>; row: R; text: string | undefined; onText: (t: string) => void; onApply: (r: R) => void }) {
  const [q, setQ] = useState<string | null>(null)
  const list = q != null && q.trim() ? col.suggest!(q, row).slice(0, 8) : []
  const current = formatValue(col, row)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          className={cn(inputCls, 'pl-9')}
          value={q ?? text ?? current}
          placeholder={col.placeholder ?? 'พิมพ์เพื่อค้นหา…'}
          onFocus={(e) => {
            setQ(e.target.value === current ? '' : e.target.value)
          }}
          onChange={(e) => {
            setQ(e.target.value)
            onText(e.target.value)
          }}
          autoFocus={!current}
        />
      </div>
      {list.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-line">
          {list.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => {
                  onApply(s.apply(row))
                  setQ(null)
                }}
                className="flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-brand-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.label}</span>
                  {s.detail && <span className="block truncate text-xs text-muted">{s.detail}</span>}
                </span>
                {s.aside && <span className="shrink-0 text-xs text-muted">{s.aside}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
