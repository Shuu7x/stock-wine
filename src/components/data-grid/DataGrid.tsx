import { ChevronDown, Filter, ArrowDown, ArrowUp, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { loadPageSize, Pager, savePageSize } from '@/components/ui/pager'
import { cn } from '@/lib/cn'
import { fmtMoney } from '@/lib/format'
import { CellEditor, type EditorCommit, type MoveAfter } from './CellEditor'
import { FilterMenu } from './FilterMenu'
import type { CellPos, CellValue, FilterState, GridColumn, Selection, SortState } from './types'
import {
  BLANK_LABEL,
  fillSeries,
  formatValue,
  getValue,
  isReadOnly,
  normRange,
  parseText,
  parseTsv,
  setValue,
  toTsv,
} from './utils'

const ROW_H = 34
const HEAD_H = 44
const ROWHEAD_W = 52
const OVERSCAN = 6

type Range = { top: number; bottom: number; left: number; right: number }

export type RowStatus = 'added' | 'deleted'

const STATUS_LABELS = { added: 'เพิ่มใหม่', changed: 'แก้ไข', deleted: 'ลบ' }

export type DataGridProps<R> = {
  rows: R[]
  columns: GridColumn<R>[]
  getRowId: (row: R) => string
  /** ไม่ส่ง = ตารางอ่านอย่างเดียว */
  onRowsChange?: (rows: R[]) => void
  /** ส่งมา = เพิ่มแถวได้ (แทรกแถว · วางข้อมูลเกินแถวสุดท้าย) */
  createRow?: () => R
  /** ลบแถวแบบกำหนดเอง (เช่น soft delete) ถ้าไม่ส่งแต่มี createRow จะลบออกจาก rows */
  onDeleteRows?: (ids: string[]) => void
  onSelectionChange?: (rowIds: string[]) => void
  cellError?: (row: R, key: string) => string | null | undefined
  /** สถานะทั้งแถว: เพิ่มใหม่ (เขียว) · ลบ (แดง) */
  rowStatus?: (row: R) => RowStatus | null | undefined
  /** เซลล์ที่ค่าเปลี่ยนจากเดิม (เหลือง) */
  cellChanged?: (row: R, key: string) => boolean
  /** ชื่อสถานะในแถบล่าง */
  statusLabels?: Partial<Record<RowStatus | 'changed', string>>
  rowClassName?: (row: R) => string | undefined
  /** ค้นหาทุกคอลัมน์ */
  search?: string
  emptyState?: ReactNode
  /** จำนวนแถวต่อหน้าเริ่มต้น (0 = ทั้งหมด) · false = ไม่แบ่งหน้า */
  pageSize?: number | false
  /** key สำหรับจำขนาดหน้าที่ผู้ใช้เลือก */
  pageSizeKey?: string
  className?: string
}

export function DataGrid<R>({
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
  statusLabels,
  rowClassName,
  search = '',
  emptyState,
  pageSize: defaultPageSize = 50,
  pageSizeKey,
  className,
}: DataGridProps<R>) {
  const editable = !!onRowsChange
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRefs = useRef<Array<HTMLDivElement | null>>([])

  const [widths, setWidths] = useState(() => columns.map((c) => c.width ?? 120))
  useEffect(() => {
    setWidths((w) => (w.length === columns.length ? w : columns.map((c) => c.width ?? 120)))
  }, [columns])
  const offsets = useMemo(() => {
    const o: number[] = []
    let x = 0
    for (const w of widths) {
      o.push(x)
      x += w
    }
    o.push(x)
    return o
  }, [widths])
  const totalW = ROWHEAD_W + offsets[offsets.length - 1]

  const [sel, setSel] = useState<Selection | null>(null)
  const [editing, setEditing] = useState<{ r: number; c: number; text: string; openList: boolean } | null>(null)
  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>({})
  const [filterMenu, setFilterMenu] = useState<number | null>(null)
  const [fillTarget, setFillTarget] = useState<Range | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [viewport, setViewport] = useState({ top: 0, h: 600 })

  // ── มุมมอง (กรอง/เรียง) ────────────────────────────────────────────────
  // แถวที่แก้หลังกรอง/เรียงแล้วจะไม่กระโดดหาย (เหมือน Excel ที่ต้องกด apply ใหม่)
  const viewKey = JSON.stringify([sort, filters, search.trim().toLowerCase()])
  const viewActive = viewKey !== JSON.stringify([null, {}, ''])
  const snap = useRef<{ key: string; ids: string[]; known: Set<string> } | null>(null)

  /** ลำดับแถวทั้งหมดหลังกรอง/เรียง (ทุกหน้า) */
  const fullIdx = useMemo(() => {
    if (!viewActive) {
      snap.current = null
      return rows.map((_, i) => i)
    }
    const idToIdx = new Map(rows.map((r, i) => [getRowId(r), i]))
    if (!snap.current || snap.current.key !== viewKey) {
      const q = search.trim().toLowerCase()
      let idx = rows.map((_, i) => i)
      for (const [key, allowed] of Object.entries(filters)) {
        const col = columns.find((c) => c.key === key)
        if (!col) continue
        const set = new Set(allowed)
        idx = idx.filter((i) => set.has(formatValue(col, rows[i]) || BLANK_LABEL))
      }
      if (q) {
        idx = idx.filter((i) => columns.some((c) => formatValue(c, rows[i]).toLowerCase().includes(q)))
      }
      if (sort) {
        const col = columns.find((c) => c.key === sort.key)
        if (col) {
          const mul = sort.dir === 'asc' ? 1 : -1
          idx.sort((a, b) => {
            const av = getValue(col, rows[a])
            const bv = getValue(col, rows[b])
            if (av == null && bv == null) return 0
            if (av == null) return 1
            if (bv == null) return -1
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
            return formatValue(col, rows[a]).localeCompare(formatValue(col, rows[b]), 'th', { numeric: true }) * mul
          })
        }
      }
      snap.current = { key: viewKey, ids: idx.map((i) => getRowId(rows[i])), known: new Set(idToIdx.keys()) }
    } else {
      const s = snap.current
      const ids = s.ids.filter((id) => idToIdx.has(id))
      for (const r of rows) {
        const id = getRowId(r)
        if (!s.known.has(id)) {
          ids.push(id)
          s.known.add(id)
        }
      }
      s.ids = ids
    }
    return snap.current.ids.map((id) => idToIdx.get(id)!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, viewKey, viewActive])

  // ── แบ่งหน้า (ฝั่งเบราว์เซอร์ บนผลลัพธ์ที่กรอง/เรียงแล้ว) ─────────────────────
  const paged = defaultPageSize !== false
  const [pageSize, setPageSize] = useState(() => (paged ? loadPageSize(pageSizeKey, defaultPageSize) : 0))
  const [page, setPage] = useState(1)
  const pages = pageSize ? Math.max(1, Math.ceil(fullIdx.length / pageSize)) : 1
  const curPage = Math.min(page, pages)
  const start = pageSize ? (curPage - 1) * pageSize : 0
  const viewIdx = useMemo(
    () => (pageSize ? fullIdx.slice(start, start + pageSize) : fullIdx),
    [fullIdx, start, pageSize],
  )

  useEffect(() => setPage(1), [viewKey])

  function goPage(p: number) {
    setPage(p)
    setSel(null)
    setEditing(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  function changePageSize(n: number) {
    // คงแถวบนสุดของหน้าปัจจุบันให้อยู่ในหน้าใหม่
    setPageSize(n)
    savePageSize(pageSizeKey, n)
    goPage(n ? Math.floor(start / n) + 1 : 1)
  }

  const nRows = viewIdx.length
  const nCols = columns.length
  const rowAt = (r: number) => rows[viewIdx[r]]

  // selection ที่หลุดขอบ (เช่นหลังลบแถว/กรอง) ให้หดเข้ามา
  useEffect(() => {
    if (!sel) return
    const clamp = (p: CellPos) => ({ r: Math.min(p.r, nRows - 1), c: Math.min(p.c, nCols - 1) })
    if (nRows === 0) setSel(null)
    else if (sel.anchor.r >= nRows || sel.focus.r >= nRows) setSel({ anchor: clamp(sel.anchor), focus: clamp(sel.focus) })
  }, [nRows, nCols, sel])

  useEffect(() => {
    if (!onSelectionChange) return
    if (!sel) return onSelectionChange([])
    const { top, bottom } = normRange(sel)
    const ids: string[] = []
    for (let r = top; r <= bottom && r < nRows; r++) ids.push(getRowId(rowAt(r)))
    onSelectionChange(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, viewIdx])

  // ── undo / redo ─────────────────────────────────────────────────────────
  const past = useRef<R[][]>([])
  const future = useRef<R[][]>([])
  const lastEmitted = useRef(rows)
  const knownIds = useRef(new Set<string>())
  useEffect(() => {
    if (rows !== lastEmitted.current) {
      // เพิ่มแถวจากภายนอก (ปุ่มเพิ่มแถว) แล้วแถวใหม่อยู่หน้าอื่น → พาไปหน้านั้น
      // แล้วเลื่อนไปเลือกแถวใหม่แถวแรก ให้พิมพ์ต่อได้ทันที
      const firstNew = fullIdx.findIndex((i) => !knownIds.current.has(getRowId(rows[i])))
      if (firstNew >= 0 && knownIds.current.size > 0) {
        let pageStart = start
        if (pageSize && (firstNew < start || firstNew >= start + pageSize)) {
          goPage(Math.floor(firstNew / pageSize) + 1)
          pageStart = Math.floor(firstNew / pageSize) * pageSize
        }
        const p = { r: firstNew - pageStart, c: 0 }
        setSel({ anchor: p, focus: p })
        requestAnimationFrame(() => {
          ensureVisible(p)
          focusGrid()
        })
      }
      // rows ถูกเปลี่ยนจากภายนอก (เช่นบันทึกแล้วรีเซ็ต) ประวัติเดิมใช้ไม่ได้แล้ว
      past.current = []
      future.current = []
      lastEmitted.current = rows
    }
    knownIds.current = new Set(rows.map(getRowId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const emit = useCallback(
    (next: R[]) => {
      if (!onRowsChange) return
      past.current.push(rows)
      if (past.current.length > 100) past.current.shift()
      future.current = []
      lastEmitted.current = next
      onRowsChange(next)
    },
    [onRowsChange, rows],
  )

  function undo() {
    const prev = past.current.pop()
    if (!prev || !onRowsChange) return
    future.current.push(rows)
    lastEmitted.current = prev
    onRowsChange(prev)
  }
  function redo() {
    const next = future.current.pop()
    if (!next || !onRowsChange) return
    past.current.push(rows)
    lastEmitted.current = next
    onRowsChange(next)
  }

  // ── viewport / scroll ───────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport({ top: el.scrollTop, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [])

  const first = Math.max(0, Math.floor(viewport.top / ROW_H) - OVERSCAN)
  const last = Math.min(nRows - 1, Math.ceil((viewport.top + viewport.h) / ROW_H) + OVERSCAN)

  function ensureVisible(p: CellPos) {
    const el = scrollRef.current
    if (!el) return
    const y = p.r * ROW_H
    if (y < el.scrollTop) el.scrollTop = y
    else if (y + ROW_H + HEAD_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H + HEAD_H - el.clientHeight
    const x = offsets[p.c]
    const xr = offsets[p.c + 1] + ROWHEAD_W
    if (x < el.scrollLeft) el.scrollLeft = x
    else if (xr > el.scrollLeft + el.clientWidth) el.scrollLeft = xr - el.clientWidth
  }

  const focusGrid = () => scrollRef.current?.focus({ preventScroll: true })

  function select(p: CellPos, extend = false) {
    const q = { r: Math.max(0, Math.min(p.r, nRows - 1)), c: Math.max(0, Math.min(p.c, nCols - 1)) }
    setSel((s) => (extend && s ? { anchor: s.anchor, focus: q } : { anchor: q, focus: q }))
    ensureVisible(q)
  }

  function cellAt(clientX: number, clientY: number): CellPos {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    const y = clientY - rect.top + el.scrollTop - HEAD_H
    const x = clientX - rect.left + el.scrollLeft - ROWHEAD_W
    const r = Math.max(0, Math.min(nRows - 1, Math.floor(y / ROW_H)))
    let c = 0
    while (c < nCols - 1 && x >= offsets[c + 1]) c++
    return { r, c }
  }

  function autoScroll(clientX: number, clientY: number) {
    const el = scrollRef.current!
    const rect = el.getBoundingClientRect()
    if (clientY > rect.bottom - 28) el.scrollTop += 24
    else if (clientY < rect.top + HEAD_H + 12) el.scrollTop -= 24
    if (clientX > rect.right - 28) el.scrollLeft += 24
    else if (clientX < rect.left + ROWHEAD_W + 12) el.scrollLeft -= 24
  }

  // ── แก้ไขค่า ─────────────────────────────────────────────────────────────
  function canEdit(r: number, c: number) {
    return editable && r < nRows && !isReadOnly(columns[c], rowAt(r))
  }

  function startEdit(r: number, c: number, text?: string, openList = false) {
    if (!canEdit(r, c)) return
    const col = columns[c]
    // ช่องที่มีตัวเลือก (select / ตัวเลือกที่ใช้บ่อย) เปิดรายการทันทีเมื่อเข้าแก้
    // ยกเว้นเริ่มจากการพิมพ์ทับ ซึ่งจะกรองรายการให้เอง
    const showAll = openList || ((col.type === 'select' || !!col.options) && text === undefined)
    setEditing({ r, c, text: text ?? formatValue(col, rowAt(r)), openList: showAll })
    setMenu(null)
  }

  function moveFrom(p: CellPos, move: MoveAfter) {
    const d = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1], none: [0, 0] }[move]
    select({ r: p.r + d[0], c: p.c + d[1] })
  }

  function commitEdit(commit: EditorCommit<R>, move: MoveAfter): boolean {
    if (!editing) return true
    const { r, c } = editing
    if (r >= nRows) {
      setEditing(null)
      return true
    }
    const col = columns[c]
    const ri = viewIdx[r]
    const row = rows[ri]
    let nextRow = row
    if (commit.kind === 'suggestion') {
      nextRow = commit.suggestion.apply(row)
    } else {
      const v = parseText(col, commit.text, row)
      if (v === undefined) return false
      if (v !== getValue(col, row)) nextRow = setValue(col, row, v)
    }
    if (nextRow !== row) {
      const next = rows.slice()
      next[ri] = nextRow
      emit(next)
    }
    setEditing(null)
    focusGrid()
    moveFrom({ r, c }, move)
    return true
  }

  /** เปลี่ยนหลายเซลล์ในครั้งเดียว (ได้ undo 1 ขั้น) */
  function applyCells(fn: (put: (r: number, c: number, v: CellValue | undefined) => void) => void) {
    const next = rows.slice()
    let changed = false
    fn((r, c, v) => {
      if (v === undefined || r >= viewIdx.length) return
      const ri = viewIdx[r]
      const col = columns[c]
      if (!col || isReadOnly(col, next[ri])) return
      next[ri] = setValue(col, next[ri], v)
      changed = true
    })
    if (changed) emit(next)
  }

  function clearRange() {
    if (!sel || !editable) return
    const g = normRange(sel)
    applyCells((put) => {
      for (let r = g.top; r <= g.bottom; r++) for (let c = g.left; c <= g.right; c++) put(r, c, null)
    })
  }

  function copyText(): string {
    if (!sel) return ''
    const g = normRange(sel)
    const m: string[][] = []
    for (let r = g.top; r <= g.bottom; r++) {
      const line: string[] = []
      for (let c = g.left; c <= g.right; c++) line.push(formatValue(columns[c], rowAt(r)))
      m.push(line)
    }
    return toTsv(m)
  }

  function pasteText(text: string) {
    if (!sel || !editable || !onRowsChange) return
    const matrix = parseTsv(text)
    if (!matrix.length) return
    const g = normRange(sel)
    const single = matrix.length === 1 && matrix[0].length === 1
    const h = single ? g.bottom - g.top + 1 : matrix.length
    const w = single ? g.right - g.left + 1 : Math.max(...matrix.map((m) => m.length))

    const next = rows.slice()
    // วางล้นหน้าได้: ใช้ลำดับแถวของหน้านี้ต่อด้วยหน้าถัดไป
    const map = fullIdx.slice(start)
    let need = g.top + h - map.length
    if (need > 0 && createRow) {
      while (need-- > 0) {
        next.push(createRow())
        map.push(next.length - 1)
      }
    }
    let bad = 0
    let changed = false
    for (let i = 0; i < h; i++) {
      const r = g.top + i
      if (r >= map.length) break
      for (let j = 0; j < w; j++) {
        const col = columns[g.left + j]
        if (!col) break
        const raw = single ? matrix[0][0] : (matrix[i][j] ?? '')
        const ri = map[r]
        if (isReadOnly(col, next[ri])) continue
        const v = parseText(col, raw, next[ri])
        if (v === undefined) {
          bad++
          continue
        }
        next[ri] = setValue(col, next[ri], v)
        changed = true
      }
    }
    if (changed || next.length !== rows.length) emit(next)
    setSel({
      anchor: { r: g.top, c: g.left },
      focus: {
        r: Math.min(g.top + h - 1, map.length - 1, pageSize ? pageSize - 1 : Infinity),
        c: Math.min(g.left + w - 1, nCols - 1),
      },
    })
    if (bad) toast.warning(`ข้าม ${bad} เซลล์ที่รูปแบบไม่ตรงกับคอลัมน์`)
  }

  function insertRows(where: 'above' | 'below') {
    if (!sel || !createRow || !onRowsChange) return
    const g = normRange(sel)
    const count = g.bottom - g.top + 1
    const anchorRow = where === 'above' ? viewIdx[g.top] : viewIdx[g.bottom] + 1
    const at = anchorRow ?? rows.length
    const next = rows.slice()
    next.splice(at, 0, ...Array.from({ length: count }, () => createRow()))
    emit(next)
  }

  function deleteRows() {
    if (!sel) return
    const g = normRange(sel)
    const ids: string[] = []
    for (let r = g.top; r <= g.bottom && r < nRows; r++) ids.push(getRowId(rowAt(r)))
    if (!ids.length) return
    if (onDeleteRows) onDeleteRows(ids)
    else if (createRow && onRowsChange) {
      const drop = new Set(ids)
      emit(rows.filter((r) => !drop.has(getRowId(r))))
      setSel({ anchor: { r: g.top, c: sel.anchor.c }, focus: { r: g.top, c: sel.anchor.c } })
    }
  }

  function fillDown() {
    if (!sel) return
    const g = normRange(sel)
    if (g.top === g.bottom) return
    applyCells((put) => {
      for (let c = g.left; c <= g.right; c++) {
        const v = getValue(columns[c], rowAt(g.top))
        for (let r = g.top + 1; r <= g.bottom; r++) put(r, c, v)
      }
    })
  }

  // ── ลากมุมเพื่อคัดลอก (fill handle) ──────────────────────────────────────
  function applyFill(src: Range, dst: Range) {
    applyCells((put) => {
      if (dst.bottom > src.bottom || dst.top < src.top) {
        const down = dst.bottom > src.bottom
        const count = down ? dst.bottom - src.bottom : src.top - dst.top
        for (let c = src.left; c <= src.right; c++) {
          const source: CellValue[] = []
          for (let r = src.top; r <= src.bottom; r++) source.push(getValue(columns[c], rowAt(r)))
          const vals = fillSeries(source, count, down)
          vals.forEach((v, i) => put(down ? src.bottom + 1 + i : src.top - 1 - i, c, v))
        }
      } else {
        const right = dst.right > src.right
        const count = right ? dst.right - src.right : src.left - dst.left
        const width = src.right - src.left + 1
        for (let r = src.top; r <= src.bottom; r++) {
          for (let i = 0; i < count; i++) {
            const c = right ? src.right + 1 + i : src.left - 1 - i
            const from = right ? src.left + (i % width) : src.right - (i % width)
            put(r, c, parseText(columns[c], formatValue(columns[from], rowAt(r)), rowAt(r)))
          }
        }
      }
    })
  }

  function onFillPointerDown(e: ReactPointerEvent) {
    if (!sel) return
    e.preventDefault()
    e.stopPropagation()
    const src = normRange(sel)
    let target: Range = src
    const move = (ev: PointerEvent) => {
      autoScroll(ev.clientX, ev.clientY)
      const p = cellAt(ev.clientX, ev.clientY)
      const dv = p.r > src.bottom ? p.r - src.bottom : p.r < src.top ? p.r - src.top : 0
      const dh = p.c > src.right ? p.c - src.right : p.c < src.left ? p.c - src.left : 0
      if (Math.abs(dv) >= Math.abs(dh)) {
        target = { ...src, top: Math.min(src.top, p.r), bottom: Math.max(src.bottom, p.r) }
      } else {
        target = { ...src, left: Math.min(src.left, p.c), right: Math.max(src.right, p.c) }
      }
      setFillTarget(target)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setFillTarget(null)
      if (target !== src) {
        applyFill(src, target)
        setSel({ anchor: { r: target.top, c: target.left }, focus: { r: target.bottom, c: target.right } })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ── เมาส์/นิ้ว บนเซลล์ ───────────────────────────────────────────────────
  function onBodyPointerDown(e: ReactPointerEvent) {
    if (e.button === 2 || nRows === 0) return
    const p = cellAt(e.clientX, e.clientY)
    const wasActive = sel && sel.anchor.r === p.r && sel.anchor.c === p.c && sel.focus.r === p.r && sel.focus.c === p.c
    if (e.pointerType === 'mouse') e.preventDefault()
    focusGrid()
    setMenu(null)
    if (e.shiftKey && sel) {
      select(p, true)
      return
    }
    // แตะเซลล์ที่เลือกอยู่แล้วซ้ำ = แก้ไข (เป็นมิตรกับจอสัมผัส)
    if (wasActive && e.pointerType !== 'mouse') {
      startEdit(p.r, p.c)
      return
    }
    select(p)
    if (e.pointerType !== 'mouse') return
    const move = (ev: PointerEvent) => {
      autoScroll(ev.clientX, ev.clientY)
      const q = cellAt(ev.clientX, ev.clientY)
      setSel((s) => (s && (s.focus.r !== q.r || s.focus.c !== q.c) ? { anchor: s.anchor, focus: q } : s))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onRowHeadPointerDown(e: ReactPointerEvent, r: number) {
    e.preventDefault()
    e.stopPropagation()
    focusGrid()
    if (e.shiftKey && sel) setSel({ anchor: { r: sel.anchor.r, c: 0 }, focus: { r, c: nCols - 1 } })
    else setSel({ anchor: { r, c: 0 }, focus: { r, c: nCols - 1 } })
  }

  function selectColumn(c: number) {
    if (!nRows) return
    focusGrid()
    setSel({ anchor: { r: 0, c }, focus: { r: nRows - 1, c } })
  }

  // ── คีย์บอร์ด ──────────────────────────────────────────────────────────
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== scrollRef.current || editing) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && k === 'z') {
      e.preventDefault()
      return e.shiftKey ? redo() : undo()
    }
    if (mod && k === 'y') {
      e.preventDefault()
      return redo()
    }
    if (mod && k === 'a') {
      e.preventDefault()
      if (nRows) setSel({ anchor: { r: 0, c: 0 }, focus: { r: nRows - 1, c: nCols - 1 } })
      return
    }
    if (!sel || nRows === 0) {
      if (nRows && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'].includes(e.key)) {
        e.preventDefault()
        select({ r: 0, c: 0 })
      }
      return
    }
    if (mod && k === 'd') {
      e.preventDefault()
      return fillDown()
    }
    const { anchor, focus } = sel
    const cur = e.shiftKey ? focus : anchor
    const page = Math.max(1, Math.floor(viewport.h / ROW_H) - 2)
    const go = (p: CellPos) => {
      e.preventDefault()
      select(p, e.shiftKey)
    }
    switch (e.key) {
      case 'ArrowDown':
        return go({ r: mod ? nRows - 1 : cur.r + 1, c: cur.c })
      case 'ArrowUp':
        return go({ r: mod ? 0 : cur.r - 1, c: cur.c })
      case 'ArrowRight':
        return go({ r: cur.r, c: mod ? nCols - 1 : cur.c + 1 })
      case 'ArrowLeft':
        return go({ r: cur.r, c: mod ? 0 : cur.c - 1 })
      case 'PageDown':
        return go({ r: cur.r + page, c: cur.c })
      case 'PageUp':
        return go({ r: cur.r - page, c: cur.c })
      case 'Home':
        return go({ r: mod ? 0 : cur.r, c: 0 })
      case 'End':
        return go({ r: mod ? nRows - 1 : cur.r, c: nCols - 1 })
      case 'Tab':
        e.preventDefault()
        return select({ r: anchor.r, c: anchor.c + (e.shiftKey ? -1 : 1) })
      case 'Enter':
      case 'F2':
        e.preventDefault()
        if (canEdit(anchor.r, anchor.c)) startEdit(anchor.r, anchor.c)
        else select({ r: anchor.r + 1, c: anchor.c })
        return
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        return clearRange()
      case 'Escape':
        setMenu(null)
        return setSel({ anchor, focus: anchor })
    }
    if (e.key.length === 1 && !mod && !e.altKey && canEdit(anchor.r, anchor.c)) {
      e.preventDefault()
      startEdit(anchor.r, anchor.c, e.key)
    }
  }

  function onCopy(e: ClipboardEvent) {
    if (e.target !== scrollRef.current || !sel) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', copyText())
  }
  function onCut(e: ClipboardEvent) {
    if (e.target !== scrollRef.current || !sel) return
    onCopy(e)
    clearRange()
  }
  function onPaste(e: ClipboardEvent) {
    if (e.target !== scrollRef.current) return
    e.preventDefault()
    pasteText(e.clipboardData.getData('text/plain'))
  }

  // ── หัวคอลัมน์ ───────────────────────────────────────────────────────────
  function startResize(e: ReactPointerEvent, c: number) {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const w0 = widths[c]
    const move = (ev: PointerEvent) =>
      setWidths((ws) => ws.map((w, i) => (i === c ? Math.max(48, w0 + ev.clientX - x0) : w)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const filterValues = useMemo(() => {
    if (filterMenu == null) return []
    const col = columns[filterMenu]
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = formatValue(col, r) || BLANK_LABEL
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) =>
        a.value === BLANK_LABEL ? 1 : b.value === BLANK_LABEL ? -1 : a.value.localeCompare(b.value, 'th', { numeric: true }),
      )
  }, [filterMenu, columns, rows])

  // ── สรุปของช่วงที่เลือก (แบบแถบสถานะ Excel) ────────────────────────────────
  const summary = useMemo(() => {
    if (!sel) return null
    const g = normRange(sel)
    const cells = (g.bottom - g.top + 1) * (g.right - g.left + 1)
    if (cells < 2) return null
    let sum = 0
    let nums = 0
    for (let r = g.top; r <= g.bottom && r < nRows; r++) {
      for (let c = g.left; c <= g.right; c++) {
        if (columns[c].type !== 'number') continue
        const v = getValue(columns[c], rowAt(r))
        if (typeof v === 'number') {
          sum += v
          nums++
        }
      }
    }
    return { cells, sum, nums }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, rows, viewIdx, columns])

  const statusCounts = useMemo(() => {
    if (!rowStatus && !cellChanged) return null
    const n = { added: 0, changed: 0, deleted: 0 }
    for (const r of rows) {
      const st = rowStatus?.(r)
      if (st) n[st]++
      else if (cellChanged && columns.some((c) => cellChanged(r, c.key))) n.changed++
    }
    return n.added + n.changed + n.deleted ? n : null
  }, [rows, columns, rowStatus, cellChanged])

  // ── render ──────────────────────────────────────────────────────────────
  const range = sel ? normRange(sel) : null
  const rect = (g: Range) => ({
    left: ROWHEAD_W + offsets[g.left],
    top: HEAD_H + g.top * ROW_H,
    width: offsets[g.right + 1] - offsets[g.left],
    height: (g.bottom - g.top + 1) * ROW_H,
  })
  const activeFilters = Object.keys(filters).length

  const bodyRows: ReactNode[] = []
  for (let r = first; r <= last; r++) {
    const row = rowAt(r)
    const inRows = range && r >= range.top && r <= range.bottom
    const rowErr = cellError && columns.some((c) => cellError(row, c.key))
    const status = rowStatus?.(row)
    const rowChanged = !status && cellChanged && columns.some((c) => cellChanged(row, c.key))
    bodyRows.push(
      <div
        key={getRowId(row)}
        className={cn('absolute left-0 flex', rowClassName?.(row))}
        style={{ top: HEAD_H + r * ROW_H, height: ROW_H, width: totalW }}
      >
        <div
          onPointerDown={(e) => onRowHeadPointerDown(e, r)}
          className={cn(
            'sticky left-0 z-[15] flex shrink-0 cursor-pointer items-center justify-center border-r border-b border-line text-xs tabular-nums select-none',
            inRows ? 'bg-brand-100 font-semibold text-brand-900' : 'bg-surface-2 text-muted',
          )}
          style={{ width: ROWHEAD_W }}
        >
          {(status || rowChanged) && (
            <span
              className={cn(
                'absolute inset-y-0 left-0 w-1',
                status === 'added' ? 'bg-success-600' : status === 'deleted' ? 'bg-danger-600' : 'bg-warning-600',
              )}
            />
          )}
          {rowErr && <span className="absolute left-2 size-1.5 rounded-full bg-danger-600" />}
          {start + r + 1}
        </div>
        {columns.map((col, c) => {
          const ro = !editable || isReadOnly(col, row)
          const err = cellError?.(row, col.key)
          const changed = !err && status !== 'deleted' && !!cellChanged?.(row, col.key)
          const active = sel?.anchor.r === r && sel.anchor.c === c
          // select มีลูกศรตลอดให้รู้ว่าเลือกได้ · ช่องที่มีตัวเลือกช่วยแสดงเมื่อชี้/เลือก
          const chevron = editable && !ro && (col.options || col.suggest) ? (col.type === 'select' || active ? 'show' : 'hover') : null
          return (
            <div
              key={col.key}
              title={err ?? undefined}
              className={cn(
                'group/cell relative flex shrink-0 items-center overflow-hidden border-r border-b border-line px-2 text-sm whitespace-nowrap',
                col.align === 'right' && 'justify-end tabular-nums',
                col.align === 'center' && 'justify-center',
                ro && editable && 'bg-readonly text-ink-2',
                status === 'added' && 'bg-success-50',
                status === 'deleted' && 'bg-danger-50 text-danger-700 line-through decoration-danger-600/60',
                changed && 'bg-warning-100',
                err && 'bg-danger-50',
                chevron && 'pr-6',
              )}
              style={{ width: widths[c] }}
            >
              {err && (
                <span className="absolute top-0 left-0 size-0 border-t-[7px] border-r-[7px] border-t-danger-600 border-r-transparent" />
              )}
              <span className="truncate">{col.render ? col.render(row) : formatValue(col, row)}</span>
              {chevron && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="เปิดรายการ"
                  onPointerDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    startEdit(r, c, formatValue(col, row), true)
                  }}
                  className={cn(
                    'absolute top-1/2 right-0.5 z-10 -translate-y-1/2 rounded p-0.5 text-muted transition hover:bg-surface hover:text-brand-700',
                    chevron === 'hover' && !active && 'opacity-0 group-hover/cell:opacity-100',
                    active && 'bg-surface/90 shadow-sm',
                  )}
                >
                  <ChevronDown className="size-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>,
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface', className)}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={fullIdx.length}
        aria-colcount={nCols}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onContextMenu={(e) => {
          if ((e.target as Element).closest('[data-grid-head]')) return
          e.preventDefault()
          if (!nRows) return
          const p = cellAt(e.clientX, e.clientY)
          if (!range || p.r < range.top || p.r > range.bottom || p.c < range.left || p.c > range.right) select(p)
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none select-none"
      >
        <div style={{ width: totalW, height: HEAD_H + nRows * ROW_H, position: 'relative' }}>
          {/* header */}
          <div data-grid-head className="sticky top-0 z-20 flex" style={{ height: HEAD_H, width: totalW }}>
            <div
              className="sticky left-0 z-[25] flex shrink-0 items-center justify-center border-r border-b border-line-strong bg-surface-3 text-xs text-muted"
              style={{ width: ROWHEAD_W }}
              onPointerDown={(e) => {
                e.preventDefault()
                focusGrid()
                if (nRows) setSel({ anchor: { r: 0, c: 0 }, focus: { r: nRows - 1, c: nCols - 1 } })
              }}
              title="เลือกทั้งหมด"
            >
              #
            </div>
            {columns.map((col, c) => {
              const filtered = !!filters[col.key]
              const sorted = sort?.key === col.key ? sort.dir : null
              const inCols = range && c >= range.left && c <= range.right
              return (
                <div
                  key={col.key}
                  ref={(el) => {
                    headerRefs.current[c] = el
                  }}
                  className={cn(
                    'group relative flex shrink-0 items-center gap-1 border-r border-b border-line-strong pr-1 pl-2',
                    inCols ? 'bg-brand-100 text-brand-900' : 'bg-surface-3 text-ink',
                  )}
                  style={{ width: widths[c] }}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => selectColumn(c)}
                    className={cn('min-w-0 flex-1 text-left leading-tight', col.align === 'right' && 'text-right')}
                  >
                    <span className="block truncate text-xs font-semibold">{col.title}</span>
                    {col.subtitle && <span className="block truncate text-[10px] text-muted">{col.subtitle}</span>}
                  </button>
                  {col.filterable !== false && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setFilterMenu(filterMenu === c ? null : c)}
                      aria-label={`ตัวกรอง ${col.title}`}
                      className={cn(
                        'flex shrink-0 items-center rounded p-1 transition',
                        filtered || sorted
                          ? 'bg-brand-700 text-white'
                          : 'text-muted opacity-60 group-hover:opacity-100 hover:bg-surface-2 pointer-coarse:opacity-100',
                      )}
                    >
                      {sorted === 'asc' ? (
                        <ArrowUp className="size-3.5" />
                      ) : sorted === 'desc' ? (
                        <ArrowDown className="size-3.5" />
                      ) : null}
                      {(filtered || !sorted) && <Filter className="size-3.5" />}
                    </button>
                  )}
                  <div
                    onPointerDown={(e) => startResize(e, c)}
                    className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize hover:bg-brand-600/30"
                  />
                </div>
              )
            })}
          </div>

          {bodyRows.length > 0 && (
            <div className="absolute inset-0" style={{ top: 0 }} onPointerDown={onBodyPointerDown} onDoubleClick={(e) => {
              const p = cellAt(e.clientX, e.clientY)
              startEdit(p.r, p.c)
            }}>
              {bodyRows}
            </div>
          )}

          {/* กรอบช่วงที่เลือก + มุมลากคัดลอก */}
          {range && nRows > 0 && (
            <div
              className="pointer-events-none absolute z-10 border-2 border-brand-600 bg-brand-600/[0.07]"
              style={rect(range)}
            >
              {editable && !editing && (
                <div
                  onPointerDown={onFillPointerDown}
                  title="ลากเพื่อคัดลอก"
                  className="pointer-events-auto absolute -right-[5px] -bottom-[5px] size-[9px] cursor-crosshair touch-none border border-white bg-brand-600 pointer-coarse:-right-[9px] pointer-coarse:-bottom-[9px] pointer-coarse:size-[16px] pointer-coarse:rounded-full"
                />
              )}
            </div>
          )}
          {fillTarget && (
            <div className="pointer-events-none absolute z-10 border-2 border-dashed border-brand-700" style={rect(fillTarget)} />
          )}

          {editing && editing.r < nRows && (
            <div className="absolute z-30" style={rect({ top: editing.r, bottom: editing.r, left: editing.c, right: editing.c })}>
              <CellEditor
                key={`${editing.r}:${editing.c}`}
                column={columns[editing.c]}
                row={rowAt(editing.r)}
                initialText={editing.text}
                openList={editing.openList}
                onCommit={commitEdit}
                onCancel={() => {
                  setEditing(null)
                  focusGrid()
                }}
              />
            </div>
          )}
        </div>

        {nRows === 0 && (
          <div className="pointer-events-none sticky left-0 flex w-full flex-col items-center justify-center py-16 text-center text-sm text-muted" style={{ marginTop: -HEAD_H }}>
            {viewActive ? 'ไม่มีแถวที่ตรงกับตัวกรอง' : (emptyState ?? 'ยังไม่มีข้อมูล')}
          </div>
        )}
      </div>

      {/* แถบสถานะ */}
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-surface-2 px-3 py-1 text-xs text-muted">
        {viewActive && fullIdx.length !== rows.length && (
          <span>
            กรองได้ {fullIdx.length.toLocaleString('th-TH')} จาก {rows.length.toLocaleString('th-TH')} แถว
          </span>
        )}
        {!paged && <span>{rows.length.toLocaleString('th-TH')} แถว</span>}
        {statusCounts && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {(['added', 'changed', 'deleted'] as const).map((k) =>
              statusCounts[k] ? (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      'size-3 rounded-sm border',
                      k === 'added' && 'border-success-600/40 bg-success-50',
                      k === 'changed' && 'border-warning-600/40 bg-warning-100',
                      k === 'deleted' && 'border-danger-600/40 bg-danger-50',
                    )}
                  />
                  {statusLabels?.[k] ?? STATUS_LABELS[k]} <b className="text-ink tabular-nums">{statusCounts[k]}</b>
                </span>
              ) : null,
            )}
          </span>
        )}
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 font-medium text-brand-800 hover:bg-brand-200"
          >
            กรองอยู่ {activeFilters} คอลัมน์ <X className="size-3" />
          </button>
        )}
        {sort && (
          <button
            type="button"
            onClick={() => setSort(null)}
            className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 hover:bg-line"
          >
            เรียงตาม {columns.find((c) => c.key === sort.key)?.title} <X className="size-3" />
          </button>
        )}
        {summary && (
          <span className="tabular-nums">
            เลือก {summary.cells} เซลล์
            {summary.nums > 0 && (
              <>
                {' · '}ผลรวม <b className="text-ink">{fmtMoney(summary.sum)}</b>
              </>
            )}
          </span>
        )}
        {!summary && editable && (
          <span className="hidden 2xl:inline">
            ดับเบิลคลิก/Enter แก้ไข · Ctrl+C / Ctrl+V คัดลอกวางกับ Excel · ลากมุม ■ เพื่อคัดลอกค่า · Ctrl+Z ย้อนกลับ
          </span>
        )}
        {paged && (
          <Pager
            className="ml-auto"
            page={curPage}
            pageSize={pageSize}
            total={fullIdx.length}
            unit="แถว"
            onPage={goPage}
            onPageSize={changePageSize}
          />
        )}
      </div>

      {filterMenu != null && (
        <FilterMenu
          key={filterMenu}
          anchor={{ current: headerRefs.current[filterMenu] }}
          title={columns[filterMenu].title}
          values={filterValues}
          selected={filters[columns[filterMenu].key] ?? null}
          sort={sort?.key === columns[filterMenu].key ? sort.dir : null}
          onSort={(dir) => setSort(dir ? { key: columns[filterMenu].key, dir } : null)}
          onApply={(picked) =>
            setFilters((f) => {
              const next = { ...f }
              if (picked) next[columns[filterMenu].key] = picked
              else delete next[columns[filterMenu].key]
              return next
            })
          }
          onClose={() => setFilterMenu(null)}
        />
      )}

      {menu && sel && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'คัดลอก',
              hint: 'Ctrl+C',
              run: () => navigator.clipboard?.writeText(copyText()).then(() => toast.success('คัดลอกแล้ว')),
            },
            editable && {
              label: 'วาง',
              hint: 'Ctrl+V',
              run: () =>
                navigator.clipboard
                  ?.readText()
                  .then(pasteText)
                  .catch(() => toast.info('เบราว์เซอร์ไม่อนุญาต ให้กด Ctrl+V แทน')),
            },
            editable && { label: 'ล้างค่าในเซลล์', hint: 'Delete', run: clearRange },
            editable && range && range.bottom > range.top && { label: 'คัดลอกค่าบนสุดลงมา', hint: 'Ctrl+D', run: fillDown },
            createRow && 'sep',
            createRow && { label: 'แทรกแถวด้านบน', run: () => insertRows('above') },
            createRow && { label: 'แทรกแถวด้านล่าง', run: () => insertRows('below') },
            (onDeleteRows || createRow) && 'sep',
            (onDeleteRows || createRow) && {
              label: range && range.bottom > range.top ? `ลบ ${range.bottom - range.top + 1} แถว` : 'ลบแถว',
              danger: true,
              run: deleteRows,
            },
          ]}
        />
      )}
    </div>
  )
}

type MenuItem = { label: string; hint?: string; danger?: boolean; run: () => void }

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: Array<MenuItem | 'sep' | false | null | undefined | 0>
  onClose: () => void
}) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [onClose])
  const list = items.filter(Boolean) as Array<MenuItem | 'sep'>
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - list.length * 36 - 16)
  return createPortal(
    <div
      data-floating=""
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-[70] w-56 rounded-lg border border-line bg-surface py-1 text-sm shadow-2xl"
      style={{ left, top }}
    >
      {list.map((it, i) =>
        it === 'sep' ? (
          <div key={i} className="my-1 border-t border-line" />
        ) : (
          <button
            key={i}
            type="button"
            onPointerDown={(e) => e.nativeEvent.stopImmediatePropagation()}
            onClick={() => {
              it.run()
              onClose()
            }}
            className={cn(
              'flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-surface-2',
              it.danger && 'text-danger-700',
            )}
          >
            {it.label}
            {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
