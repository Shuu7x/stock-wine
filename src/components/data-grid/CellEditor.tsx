import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/cn'
import { parseDate } from '@/lib/format'
import { Floating } from './floating'
import type { GridColumn, Suggestion } from './types'
import { getOptions, matchesWords, parseText } from './utils'

export type EditorCommit<R> =
  | { kind: 'value'; text: string }
  | { kind: 'suggestion'; suggestion: Suggestion<R> }

export type MoveAfter = 'down' | 'up' | 'right' | 'left' | 'none'

type Item<R> = { key: string; label: string; detail?: string; aside?: string; suggestion?: Suggestion<R> }

export function CellEditor<R>({
  column,
  row,
  initialText,
  openList,
  onCommit,
  onCancel,
}: {
  column: GridColumn<R>
  row: R
  initialText: string
  /** เปิดรายการทั้งหมดทันที (กดปุ่ม ▾) */
  openList: boolean
  onCommit: (commit: EditorCommit<R>, move: MoveAfter) => boolean
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(initialText)
  const [typed, setTyped] = useState(!openList && initialText !== '')
  // ช่องพิมพ์อิสระไม่เลือกให้อัตโนมัติ (พิมพ์ชื่อใหม่แล้ว Enter = ค่าใหม่) · select เลือกตัวแรกให้
  const defaultHighlight = column.type === 'select' ? 0 : -1
  const [highlight, setHighlight] = useState(defaultHighlight)
  const [invalid, setInvalid] = useState(false)
  const committed = useRef(false)

  const hasList = !!column.suggest || !!column.options
  const items: Item<R>[] = useMemo(() => {
    if (!hasList) return []
    const q = typed ? text.trim() : ''
    if (column.suggest) {
      return column.suggest(q, row).map((s) => ({ ...s, suggestion: s }))
    }
    const opts = getOptions(column, row)
    const filtered = q ? opts.filter((o) => matchesWords(o, q)) : opts
    return filtered.slice(0, 80).map((o) => ({ key: o, label: o }))
  }, [hasList, column, row, text, typed])

  const listOpen = hasList && items.length > 0 && (openList || typed)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    // เปิดจากปุ่ม/ดับเบิลคลิกบนช่องที่มีรายการ: เลือกข้อความทั้งหมด พิมพ์แล้วจะค้นใหม่แทนการต่อท้าย
    if (openList) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // select: ชี้ที่ค่าปัจจุบันในรายการ (ถ้ามี) · ช่องอื่นไม่ชี้อะไร
  useEffect(() => {
    if (defaultHighlight < 0) return setHighlight(-1)
    const t = text.trim().toLowerCase()
    setHighlight(Math.max(0, items.findIndex((it) => it.label.toLowerCase() === t)))
  }, [items, text, defaultHighlight])

  function commit(move: MoveAfter, pick?: Item<R>): void {
    if (committed.current) return
    // ตั้งก่อนเรียก onCommit: onCommit ย้าย focus กลับไปที่ตาราง ทำให้ onBlur ยิงซ้อนเข้ามา
    committed.current = true
    const ok = pick?.suggestion
      ? onCommit({ kind: 'suggestion', suggestion: pick.suggestion }, move)
      : onCommit({ kind: 'value', text: pick ? pick.label : text }, move)
    if (!ok) {
      committed.current = false
      setInvalid(true)
    }
  }

  function commitText(t: string) {
    setText(t)
    if (committed.current) return
    committed.current = true
    if (!onCommit({ kind: 'value', text: t }, 'none')) committed.current = false
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation()
    const pick = listOpen && highlight >= 0 ? items[highlight] : undefined
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        commit(e.shiftKey ? 'up' : 'down', pick)
        return
      case 'Tab':
        e.preventDefault()
        commit(e.shiftKey ? 'left' : 'right', pick)
        return
      case 'Escape':
        e.preventDefault()
        committed.current = true
        onCancel()
        return
      case 'ArrowDown':
        e.preventDefault()
        if (listOpen) setHighlight((h) => Math.min(h + 1, items.length - 1))
        else commit('down')
        return
      case 'ArrowUp':
        e.preventDefault()
        if (listOpen) setHighlight((h) => Math.max(h - 1, -1))
        else commit('up')
        return
    }
  }

  // คลิกที่อื่น = ยืนยันค่า (แบบ Excel) ถ้าค่าไม่ถูกต้องให้ยกเลิก
  function onBlur() {
    if (committed.current) return
    const ok = parseText(column, text, row) !== undefined
    if (ok && text !== initialText) commit('none')
    else {
      committed.current = true
      onCancel()
    }
  }

  const listItemClass = (i: number) =>
    cn(
      'flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm',
      i === highlight ? 'bg-brand-50 text-brand-900' : 'hover:bg-surface-2',
    )

  return (
    <div className="absolute inset-0 z-20">
      <input
        ref={inputRef}
        value={text}
        placeholder={column.placeholder}
        inputMode={column.type === 'number' ? 'decimal' : undefined}
        onChange={(e) => {
          setText(e.target.value)
          setTyped(true)
          setInvalid(false)
        }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={cn(
          'h-full w-full bg-surface px-2 text-sm outline-none ring-2 ring-brand-600 ring-inset',
          column.align === 'right' && 'text-right',
          invalid && 'ring-danger-600 bg-danger-50',
        )}
        aria-invalid={invalid}
        title={invalid ? 'รูปแบบไม่ถูกต้อง' : undefined}
      />
      {column.type === 'date' && (
        <Floating
          anchor={inputRef}
          keepFocus
          width={272}
          maxHeight={360}
          className="rounded-xl border border-line bg-surface shadow-2xl"
        >
          <Calendar
            value={parseDate(text)}
            onSelect={(v) => {
              const [y, m, d] = v.split('-')
              commitText(`${d}/${m}/${y}`)
            }}
            onClear={() => commitText('')}
          />
        </Floating>
      )}
      {invalid && (
        <div className="absolute top-full left-0 z-30 mt-1 rounded bg-danger-600 px-2 py-1 text-xs whitespace-nowrap text-white shadow">
          {column.type === 'select' ? 'เลือกจากรายการเท่านั้น' : 'รูปแบบไม่ถูกต้อง'}
        </div>
      )}
      {listOpen && (
        <Floating
          anchor={inputRef}
          keepFocus
          width={column.suggest ? 420 : undefined}
          className="overflow-auto rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          <ul role="listbox">
            {items.map((it, i) => (
              <li key={it.key} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={listItemClass(i)}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commit('none', it)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.label}</span>
                    {it.detail && <span className="block truncate text-xs text-muted">{it.detail}</span>}
                  </span>
                  {it.aside && <span className="shrink-0 text-xs font-medium text-muted">{it.aside}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Floating>
      )}
    </div>
  )
}
