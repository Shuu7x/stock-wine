import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { TOURS, type TourStep } from './tours'

const KEY = 'stock-wine:tour:v1'
type Prefs = { auto: boolean; seen: string[] }

export function loadTourPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return { auto: p.auto ?? true, seen: Array.isArray(p.seen) ? p.seen : [] }
  } catch {
    return { auto: true, seen: [] }
  }
}

export function saveTourPrefs(patch: Partial<Prefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadTourPrefs(), ...patch }))
  } catch {
    /* ไม่จำ */
  }
}

function markSeen(key: string) {
  const { seen } = loadTourPrefs()
  if (!seen.includes(key)) saveTourPrefs({ seen: [...seen, key] })
}

/** องค์ประกอบแรกที่มองเห็นจริง (บางอย่างมีทั้งแบบจอคอม/มือถือ แต่ซ่อนไว้แบบหนึ่ง) */
function visible(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.getClientRects().length > 0) ?? null
}

/** ขั้นที่ใช้ได้บนหน้าจอตอนนี้ (ตัดขั้นที่หาองค์ประกอบไม่เจอ) */
function available(steps: TourStep[]) {
  return steps.flatMap((s): Array<{ s: TourStep; el: HTMLElement | undefined }> => {
    if (!s.el) return [{ s, el: undefined }]
    const el = visible(s.el)
    return el ? [{ s, el }] : []
  })
}

export function hasTour(key: string) {
  return !!TOURS[key]?.length
}

let active: ReturnType<typeof driver> | null = null

export function startTour(key: string) {
  const steps = available(TOURS[key] ?? [])
  if (!steps.length) return false
  active?.destroy()
  markSeen(key)
  const d = driver({
    showProgress: steps.length > 1,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'ถัดไป',
    prevBtnText: 'ย้อนกลับ',
    doneBtnText: 'เข้าใจแล้ว',
    popoverClass: 'wine-tour',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    smoothScroll: true,
    onDestroyed: () => {
      if (active === d) active = null
    },
    steps: steps.map(({ s, el }) => ({
      element: el,
      popover: { title: s.title, description: s.text, side: s.side, align: 'start' as const },
    })),
  })
  active = d
  d.drive()
  return true
}

/**
 * เปิดคำแนะนำเองเมื่อเข้าหน้านั้นครั้งแรก (ต่อเครื่อง)
 * รอให้หน้าโหลดองค์ประกอบครบก่อน · ไม่แทรกตอนมีหน้าต่าง (dialog) เปิดอยู่
 */
export function autoTour(key: string): () => void {
  const { auto, seen } = loadTourPrefs()
  if (!auto || seen.includes(key) || !hasTour(key)) return () => {}
  const targets = (TOURS[key] ?? []).filter((s) => s.el)
  let tries = 0
  const timer = window.setInterval(() => {
    tries++
    if (document.querySelector('[role="dialog"]')) return
    // ส่วนใหญ่ของขั้นตอนหาเจอแล้ว หรือรอนานพอ (~4 วินาที)
    const found = targets.filter((s) => visible(s.el!)).length
    if (found >= Math.ceil(targets.length * 0.6) || tries >= 8) {
      window.clearInterval(timer)
      startTour(key)
    }
  }, 500)
  return () => window.clearInterval(timer)
}
