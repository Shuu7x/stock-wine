/**
 * เปลี่ยนหน้าหลังล็อกอิน: ถ่ายภาพผิวไวน์ไว้เป็นชั้นบนสุด แล้ววงคลื่นขยายจากจุดที่กด
 * ด้านในวงเผยหน้าหลัก (ที่ render อยู่ข้างใต้แล้ว) · ชั้นนี้อยู่นอก React จึงอยู่ต่อได้หลังเปลี่ยนหน้า
 */
const DURATION = 480

export function playReveal({ canvas, card, x, y }: { canvas: HTMLCanvasElement | null; card: HTMLElement | null; x: number; y: number }) {
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const W = innerWidth
  const H = innerHeight
  const maxR = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 40

  // ภาพผิวไวน์ + ขอบมืด (ให้ตรงกับที่เห็นบนจอ)
  const shot = document.createElement('canvas')
  shot.width = canvas.width
  shot.height = canvas.height
  const g = shot.getContext('2d')!
  g.drawImage(canvas, 0, 0)
  const vig = g.createRadialGradient(shot.width / 2, shot.height / 2, Math.min(shot.width, shot.height) * 0.35, shot.width / 2, shot.height / 2, Math.hypot(shot.width, shot.height) / 2)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.5)')
  g.fillStyle = vig
  g.fillRect(0, 0, shot.width, shot.height)
  Object.assign(shot.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })

  const surface = document.createElement('div')
  Object.assign(surface.style, { position: 'fixed', inset: '0', zIndex: '9998', pointerEvents: 'none', overflow: 'hidden' })
  surface.appendChild(shot)

  // การ์ดล็อกอิน (สำเนา) จางหายไปพร้อมวงคลื่น
  if (card) {
    const r = card.getBoundingClientRect()
    const clone = card.cloneNode(true) as HTMLElement
    const src = card.querySelectorAll('input')
    clone.querySelectorAll('input').forEach((el, i) => (el.value = src[i]?.value ?? ''))
    Object.assign(clone.style, { position: 'absolute', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', transition: 'none' })
    surface.appendChild(clone)
  }

  // วงคลื่น: สันคลื่นที่ขอบรู + คลื่นจางๆ ไล่ตามบนหน้าแอป
  const rings = document.createElement('div')
  Object.assign(rings.style, { position: 'fixed', inset: '0', zIndex: '9999', pointerEvents: 'none', overflow: 'hidden' })
  const ring = (shadow: string) => {
    const el = document.createElement('div')
    Object.assign(el.style, { position: 'absolute', borderRadius: '50%', boxShadow: shadow, willChange: 'transform, opacity' })
    rings.appendChild(el)
    return el
  }
  const crest = ring('0 0 0 1.5px rgba(255,205,220,0.75), 0 0 18px 4px rgba(255,150,180,0.35), inset 0 0 22px 6px rgba(90,10,35,0.55)')
  const echo1 = ring('0 0 0 1.5px rgba(110,18,48,0.35), 0 0 14px 2px rgba(110,18,48,0.18)')
  const echo2 = ring('0 0 0 1px rgba(110,18,48,0.22)')

  document.body.append(surface, rings)

  const place = (el: HTMLElement, r: number, opacity: number) => {
    el.style.left = `${x - r}px`
    el.style.top = `${y - r}px`
    el.style.width = `${r * 2}px`
    el.style.height = `${r * 2}px`
    el.style.opacity = String(Math.max(0, opacity))
  }

  const t0 = performance.now()
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / DURATION)
    const p = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    const R = p * maxR
    const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${R}px, #000 ${R + 3}px)`
    surface.style.maskImage = mask
    surface.style.webkitMaskImage = mask
    shot.style.transform = `scale(${1 + p * 0.04})`
    shot.style.transformOrigin = `${x}px ${y}px`
    if (card) (surface.lastElementChild as HTMLElement).style.opacity = String(Math.max(0, 1 - t * 3))
    place(crest, R, 1 - t * 0.4)
    place(echo1, R * 0.78, 1 - t)
    place(echo2, R * 0.58, 1 - t)
    if (t < 1) requestAnimationFrame(tick)
    else {
      surface.remove()
      rings.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).onfinish = () => rings.remove()
    }
  }
  requestAnimationFrame(tick)
}
