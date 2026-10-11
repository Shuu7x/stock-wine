import { useSyncExternalStore } from 'react'

/**
 * ขนาดตัวหนังสือทั้งระบบ (% ของปกติ) — ตั้งค่าต่อเครื่อง เก็บใน localStorage
 * ปรับที่ font-size ของ <html>: ขนาดใน Tailwind เป็น rem จึงขยายทั้งตัวหนังสือและระยะห่างไปพร้อมกัน
 * ส่วนที่พิมพ์ (ป้าย QR / บิล) ใช้หน่วย มม. ไม่ได้รับผล
 */
export const FONT_SCALE = { min: 85, max: 130, step: 5, default: 100 } as const
const KEY = 'stock-wine:font-scale'
const EVENT = 'stock-wine:font-scale'

const clamp = (v: number) => Math.min(FONT_SCALE.max, Math.max(FONT_SCALE.min, Math.round(v / FONT_SCALE.step) * FONT_SCALE.step))

export function getFontScale(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v ? clamp(v) : FONT_SCALE.default
  } catch {
    return FONT_SCALE.default
  }
}

/** ใช้ขนาดกับหน้าเว็บ (เรียกตอนเริ่มแอปด้วย ไม่ให้กะพริบจากขนาดปกติ) */
export function applyFontScale(pct: number) {
  document.documentElement.style.fontSize = pct === FONT_SCALE.default ? '' : `${pct}%`
}

export function setFontScale(pct: number) {
  const v = clamp(pct)
  try {
    if (v === FONT_SCALE.default) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(v))
  } catch {
    /* เบราว์เซอร์ไม่อนุญาต: ใช้ได้เฉพาะรอบนี้ */
  }
  applyFontScale(v)
  current = v
  window.dispatchEvent(new Event(EVENT))
}

let current = typeof window === 'undefined' ? FONT_SCALE.default : getFontScale()

function subscribe(cb: () => void) {
  // แท็บอื่นเปลี่ยนค่า → แท็บนี้ตามด้วย
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    current = getFontScale()
    applyFontScale(current)
    cb()
  }
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', onStorage)
  }
}

/** ขนาดตัวหนังสือปัจจุบัน (%) — component ที่ใช้ขนาดเป็น px (เช่น ความสูงแถวตาราง) ใช้คูณตาม */
export function useFontScale() {
  return useSyncExternalStore(subscribe, () => current, () => FONT_SCALE.default)
}
