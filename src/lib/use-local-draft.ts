import { useEffect, useState } from 'react'

/** อ่านร่างที่เก็บไว้ในเครื่อง (ไม่มี/อ่านไม่ได้ = null) */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, value: T | null) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* โหมด private — ไม่เก็บร่าง */
  }
}

/** เก็บร่างลงเครื่องทุกครั้งที่เปลี่ยน ลบทิ้งเมื่อ isEmpty เป็นจริง */
export function usePersistDraft<T>(key: string, value: T, isEmpty: boolean) {
  useEffect(() => {
    saveDraft(key, isEmpty ? null : value)
  }, [key, value, isEmpty])
}

/** ค่าเริ่มต้นจากร่างในเครื่อง (อ่านครั้งเดียวตอนเปิดหน้า) */
export function useInitialDraft<T>(key: string) {
  const [draft] = useState(() => loadDraft<T>(key))
  return draft
}
