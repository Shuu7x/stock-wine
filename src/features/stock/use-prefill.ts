import { useNavigate } from '@tanstack/react-router'
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { PickerRow } from './item-picker'

/**
 * มาจากหน้าสต็อก/หน้าไวน์ (เลือกแถวแล้วกด ขาย/โอน/ปรับยอด) — เติมแถวของไวน์ที่เลือก แล้วล้าง query ทิ้ง
 * แถวที่มีไวน์นั้นอยู่แล้วไม่เพิ่มซ้ำ · แถวว่างเดิมถูกแทนที่
 */
export function usePrefillRows<R extends PickerRow>({
  ids,
  to,
  setRows,
  makeRow,
  isBlank,
  pad = 3,
}: {
  ids: string[]
  to: '/sale' | '/transfer' | '/adjust' | '/withdraw'
  setRows: Dispatch<SetStateAction<R[]>>
  makeRow: (stockItemId?: string) => R
  isBlank: (r: R) => boolean
  pad?: number
}) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!ids.length) return
    setRows((rs) => {
      const have = new Set(rs.map((r) => r.stock_item_id))
      const add = ids.filter((id) => !have.has(id)).map((id) => makeRow(id))
      return [...rs.filter((r) => !isBlank(r)), ...add, ...Array.from({ length: pad }, () => makeRow())]
    })
    navigate({ to, search: {}, replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
}
