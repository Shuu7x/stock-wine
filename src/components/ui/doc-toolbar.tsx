import { Eraser, Save, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { AddRows } from './add-rows'
import { Button } from './button'

/** แถบเครื่องมือของหน้าเอกสาร (รับเข้า · เบิก · ขาย · โอนย้าย · ปรับยอด) */
export function DocToolbar({
  onAddRows,
  selectedCount,
  onDeleteSelected,
  onClear,
  canClear,
  children,
  summary,
  saveLabel,
  onSave,
  saveDisabled,
}: {
  onAddRows: (n: number) => void
  selectedCount: number
  onDeleteSelected: () => void
  onClear: () => void
  canClear: boolean
  /** ปุ่มเพิ่มเติมเฉพาะหน้า */
  children?: ReactNode
  summary: ReactNode
  saveLabel: string
  onSave: () => void
  saveDisabled: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AddRows onAdd={onAddRows} />
      {selectedCount > 0 && (
        <Button size="sm" variant="ghost" className="text-danger-700" onClick={onDeleteSelected}>
          <Trash2 className="size-4" /> ลบแถวที่เลือก ({selectedCount})
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onClear} disabled={!canClear}>
        <Eraser className="size-4" /> ล้างทั้งหมด
      </Button>
      {children}
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-ink-2">{summary}</span>
        <Button variant="primary" onClick={onSave} disabled={saveDisabled}>
          <Save className="size-4" /> {saveLabel}
        </Button>
      </div>
    </div>
  )
}
