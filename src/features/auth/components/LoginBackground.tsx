import { useEffect, useRef } from 'react'

/**
 * ฉากหลังหน้า login (วาดบน canvas ทุกเฟรม)
 * - ห้องเก็บไวน์จางๆ ด้านบน (SVG) ขยับตามเมาส์เล็กน้อย
 * - คลื่นไวน์ 4 ชั้น ผิวมีไฮไลต์ ประกายวิบวับ และฟองลอยขึ้น
 * - ขวดลอยโต้คลื่นจริง: ขึ้นลงตามผิวน้ำและเอียงตามความชัน ไวน์ในขวดอยู่ระนาบเสมอ
 * - agitate: เปลี่ยนค่า → คลื่นกระเพื่อมแรงครู่หนึ่ง (รหัสผิด)
 * - flood: true → ระดับไวน์สูงขึ้นจนท่วมจอ (ล็อกอินสำเร็จ)
 */

// ─── ชั้นคลื่น (หลัง → หน้า) ───────────────────────────────────────────────────
type Layer = {
  /** ความสูงน้ำ (สัดส่วนจอ) จอแนวนอน / แนวตั้ง */
  height: [number, number]
  amp: number // สัดส่วนความสูงจอ
  waves: number // จำนวนลูกคลื่นต่อความกว้างจอ
  speed: number // px/s (+ ไปขวา)
  phase: number
  top: string
  bottom: string
  shine: number
}
const LAYERS: Layer[] = [
  { height: [0.46, 0.25], amp: 0.022, waves: 2, speed: 26, phase: 0, top: '#4a0f24', bottom: '#22060e', shine: 0.08 },
  { height: [0.4, 0.21], amp: 0.02, waves: 3, speed: -38, phase: 1.2, top: '#5c1430', bottom: '#2c0814', shine: 0.1 },
  { height: [0.32, 0.17], amp: 0.017, waves: 2.4, speed: 52, phase: 2.4, top: '#6e1a3a', bottom: '#360a1a', shine: 0.13 },
  { height: [0.24, 0.13], amp: 0.013, waves: 4, speed: -70, phase: 0.6, top: '#80203f', bottom: '#420c20', shine: 0.17 },
]

// ─── ขวด ──────────────────────────────────────────────────────────────────────
const BOTTLE = 'M15 4h10v26c0 4 9 8 9 18v64a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V48c0-10 9-14 9-18z'
const KINDS = [
  { glass: '#1f3b2a', wine: '#6e1230', label: '#f6ead0' },
  { glass: '#1f3b2a', wine: '#4a0b20', label: '#fbf7f2' },
  { glass: '#c9d6cf', wine: '#e7889b', label: '#fbf7f2' },
  { glass: '#c9d6cf', wine: '#f0d98a', label: '#f6ead0' },
  { glass: '#5a3410', wine: '#f0d98a', label: '#f6ead0' },
]
/** ไกล → ใกล้: ขนาด (สัดส่วน), ความเร็ว (px/s), ความทึบ */
const DEPTHS = [
  { size: [0.06, 0.085], speed: [18, 28], alpha: 0.7 },
  { size: [0.09, 0.12], speed: [26, 40], alpha: 0.88 },
  { size: [0.12, 0.155], speed: [36, 54], alpha: 1 },
] as const

type Bottle = {
  kind: number
  fill: number
  size: number // px
  x: number
  vx: number
  depth: 0 | 1 | 2
  tilt: number // มุมนอนพื้นฐาน (rad)
  sink: number // ตำแหน่งกลางขวดเทียบผิวน้ำ (สัดส่วนความยาวขวด, ลบ = เหนือผิว)
  wob: number // เฟสโคลง
  wobSpeed: number
}
type Sparkle = { x: number; layer: number; off: number; age: number; life: number; size: number }
type Bubble = { x: number; y: number; r: number; vy: number; ph: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export function LoginBackground({ agitate = 0, flood = false }: { agitate?: number; flood?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cellarRef = useRef<SVGSVGElement>(null)
  const agitRef = useRef(0)
  const floodRef = useRef<number | null>(null)

  useEffect(() => {
    if (agitate) agitRef.current = 1
  }, [agitate])
  useEffect(() => {
    floodRef.current = flood ? performance.now() : null
  }, [flood])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bottlePath = new Path2D(BOTTLE)

    let W = 0
    let H = 0
    let portrait = false
    let ref = 0 // ขนาดอ้างอิงของขวด
    let bottles: Bottle[] = []
    let sparkles: Sparkle[] = []
    let bubbles: Bubble[] = []
    let t = 0
    let rise = 0
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }

    const maxBottles = () => (W < 640 ? 6 : 12)
    const minBottles = () => (W < 640 ? 2 : 4)

    function layerMetrics(i: number) {
      const l = LAYERS[i]
      const len = Math.min(900, Math.max(260, W / l.waves))
      const k = (Math.PI * 2) / len
      const amp = l.amp * H * (1 + 1.6 * agitRef.current)
      // ท่วมจอ: ชั้นหน้าขึ้นก่อน ชั้นหลังตามมา
      const p = easeInOut(clamp01((rise - (3 - i) * 0.07) / 0.79))
      const restBase = H * (1 - l.height[portrait ? 1 : 0])
      const base = restBase + (-amp * 3 - 40 - restBase) * p
      return { l, k, amp, base, w: k * l.speed }
    }
    type LM = ReturnType<typeof layerMetrics>

    /** ความสูงผิวน้ำของชั้นที่ตำแหน่ง x */
    const surf = (m: LM, x: number) =>
      m.base +
      m.amp * Math.sin(m.k * x - m.w * t + m.l.phase) +
      m.amp * 0.4 * Math.sin(m.k * 1.7 * x + m.w * 0.6 * t + m.l.phase * 2)

    function newBottle(initial: boolean): Bottle {
      const r = Math.random()
      const depth = (r < 0.35 ? 0 : r < 0.7 ? 1 : 2) as Bottle['depth']
      const d = DEPTHS[depth]
      const size = rand(d.size[0], d.size[1]) * ref
      const ltr = Math.random() < 0.65
      const speed = rand(d.speed[0], d.speed[1]) * Math.max(0.55, W / 1440)
      // นอนเอียงหลายแบบ: ส่วนใหญ่เอียงมาก คอชี้ขึ้นเล็กน้อย บางขวดเกือบตั้ง
      const side = Math.random() < 0.5 ? -1 : 1
      const tilt = side * (Math.random() < 0.2 ? rand(0.1, 0.45) : rand(0.75, 1.35))
      return {
        kind: Math.floor(Math.random() * KINDS.length),
        fill: rand(0.3, 0.9),
        size,
        x: initial ? rand(0, W) : ltr ? -size - rand(0, W * 0.3) : W + size + rand(0, W * 0.3),
        vx: ltr ? speed : -speed,
        depth,
        tilt,
        sink: rand(-0.14, -0.02),
        wob: rand(0, Math.PI * 2),
        wobSpeed: rand(0.7, 1.4),
      }
    }

    function newBubble(fromBottom: boolean): Bubble {
      return { x: rand(0, W), y: fromBottom ? H + rand(0, 60) : rand(H * 0.75, H), r: rand(1, 3.2), vy: rand(14, 38), ph: rand(0, 6) }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      portrait = H / W > 1.15
      ref = Math.min(H, W * 1.4)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!bottles.length) bottles = Array.from({ length: Math.floor(rand(minBottles() + 2, maxBottles() - 2)) }, () => newBottle(true))
      if (!bubbles.length) bubbles = Array.from({ length: W < 640 ? 12 : 24 }, () => newBubble(false))
    }

    function drawLayer(m: LM, i: number) {
      const step = 8
      const x0 = -60
      const x1 = W + 60
      ctx.beginPath()
      ctx.moveTo(x0, H + 10)
      for (let x = x0; x <= x1; x += step) ctx.lineTo(x, surf(m, x))
      ctx.lineTo(x1, H + 10)
      ctx.closePath()
      const g = ctx.createLinearGradient(0, m.base - m.amp * 1.4, 0, H)
      g.addColorStop(0, m.l.top)
      g.addColorStop(1, m.l.bottom)
      ctx.fillStyle = g
      ctx.fill()

      // ไฮไลต์สันคลื่น
      ctx.beginPath()
      for (let x = x0; x <= x1; x += step) {
        const y = surf(m, x)
        if (x === x0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(255, 196, 214, ${m.l.shine})`
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.save()
      ctx.translate(0, 4)
      ctx.strokeStyle = `rgba(255, 170, 200, ${m.l.shine * 0.35})`
      ctx.lineWidth = 7
      ctx.stroke()
      ctx.restore()

      // ประกายบนผิว
      for (const s of sparkles) {
        if (s.layer !== i) continue
        const a = Math.sin((Math.PI * s.age) / s.life) * 0.85
        if (a <= 0) continue
        const x = s.x
        const y = surf(m, x) + s.off
        const r = s.size * (0.6 + 0.4 * a)
        ctx.save()
        ctx.globalAlpha = a
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
        glow.addColorStop(0, 'rgba(255,230,238,0.55)')
        glow.addColorStop(1, 'rgba(255,230,238,0)')
        ctx.fillStyle = glow
        ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6)
        ctx.fillStyle = '#fff6f8'
        ctx.beginPath()
        ctx.moveTo(x, y - r * 2)
        ctx.quadraticCurveTo(x, y, x + r * 2, y)
        ctx.quadraticCurveTo(x, y, x, y + r * 2)
        ctx.quadraticCurveTo(x, y, x - r * 2, y)
        ctx.quadraticCurveTo(x, y, x, y - r * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    function drawBottle(b: Bottle, m: LM) {
      const kind = KINDS[b.kind]
      const len = b.size
      const s = len / 120
      // ผิวน้ำตรงขวด + ความชัน
      const y = surf(m, b.x)
      const slope = Math.atan2(surf(m, b.x + 12) - surf(m, b.x - 12), 24)
      const angle = b.tilt + slope * 0.9 + Math.sin(t * b.wobSpeed + b.wob) * 0.06
      const bob = Math.sin(t * b.wobSpeed * 1.3 + b.wob) * len * 0.015
      ctx.save()
      ctx.globalAlpha = DEPTHS[b.depth].alpha
      ctx.translate(b.x, y + len * b.sink + bob)
      ctx.rotate(angle)
      ctx.scale(s, s)
      ctx.translate(-20, -70)
      ctx.fillStyle = kind.glass
      ctx.globalAlpha *= 0.94
      ctx.fill(bottlePath)
      ctx.globalAlpha = DEPTHS[b.depth].alpha
      // ไวน์ในขวด: ผิวไวน์ระนาบกับพื้นโลกเสมอ
      ctx.save()
      ctx.clip(bottlePath)
      ctx.translate(20, 70)
      ctx.rotate(-angle)
      const level = (0.55 - b.fill) * 90 * Math.abs(Math.cos(angle))
      ctx.fillStyle = kind.wine
      ctx.globalAlpha *= 0.85
      ctx.fillRect(-120, level, 240, 240)
      ctx.restore()
      // แคปซูล ฉลาก แสงสะท้อน
      ctx.fillStyle = '#c9a24a'
      ctx.fillRect(14, 1, 12, 9)
      ctx.fillStyle = kind.label
      ctx.fillRect(9, 62, 22, 26)
      ctx.fillStyle = kind.wine
      ctx.fillRect(13, 68, 14, 2)
      ctx.fillStyle = 'rgba(120,110,110,0.6)'
      ctx.fillRect(15, 74, 10, 1.5)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(10, 50)
      ctx.lineTo(10, 106)
      ctx.stroke()
      ctx.restore()
    }

    function drawBubbles(front: LM) {
      ctx.save()
      for (const b of bubbles) {
        const x = b.x + Math.sin(t * 2 + b.ph) * 3
        const sy = surf(front, x)
        if (b.y < sy + 3) continue
        const a = clamp01((b.y - sy) / 40) * 0.5
        ctx.globalAlpha = a
        ctx.strokeStyle = 'rgba(255,214,226,0.9)'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,240,245,0.8)'
        ctx.beginPath()
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    function step(dt: number) {
      t += dt
      agitRef.current *= Math.exp(-dt * 1.4)
      if (agitRef.current < 0.001) agitRef.current = 0
      const fs = floodRef.current
      rise = fs == null ? Math.max(0, rise - dt * 1.5) : clamp01((performance.now() - fs) / 1100)
      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3)
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3)

      // ขวด: ลอยตามแนวนอน พ้นจอแล้วสุ่มใหม่ (บางครั้ง 0 หรือ 2 ขวด จำนวนบนจอจึงเปลี่ยนไปเรื่อยๆ)
      const next: Bottle[] = []
      for (const b of bottles) {
        b.x += b.vx * dt * (1 + agitRef.current)
        const out = b.vx > 0 ? b.x > W + b.size * 1.2 : b.x < -b.size * 1.2
        if (!out) {
          next.push(b)
          continue
        }
        const r = Math.random()
        const n = next.length < minBottles() ? 2 : next.length >= maxBottles() ? 0 : r < 0.15 ? 0 : r > 0.85 ? 2 : 1
        for (let i = 0; i < n; i++) next.push(newBottle(false))
      }
      bottles = next

      // ประกาย: เกิดบนชั้นหน้า 2 ชั้น
      if (Math.random() < dt * (W < 640 ? 2.5 : 5)) {
        sparkles.push({ x: rand(0, W), layer: Math.random() < 0.6 ? 3 : 2, off: rand(1, 18), age: 0, life: rand(0.8, 1.8), size: rand(1.2, 2.6) })
      }
      sparkles = sparkles.filter((s) => (s.age += dt) < s.life)

      // ฟอง: ลอยขึ้นจนแตกที่ผิว แล้วเกิดใหม่จากก้น
      const front = layerMetrics(3)
      for (const b of bubbles) {
        b.y -= b.vy * dt
        if (b.y < surf(front, b.x) + 2) Object.assign(b, newBubble(true))
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      const ms = LAYERS.map((_, i) => layerMetrics(i))
      for (let i = 0; i < 4; i++) {
        // parallax: ชั้นหน้าขยับมากกว่า
        ctx.save()
        ctx.translate(mouse.x * (6 + i * 7), mouse.y * (2 + i * 3))
        drawLayer(ms[i], i)
        ctx.restore()
        if (i < 3) {
          ctx.save()
          ctx.translate(mouse.x * (6 + (i + 1) * 7), mouse.y * (2 + (i + 1) * 3))
          for (const b of bottles) if (b.depth === i) drawBottle(b, ms[i + 1])
          ctx.restore()
        }
      }
      ctx.save()
      ctx.translate(mouse.x * 27, mouse.y * 11)
      drawBubbles(ms[3])
      ctx.restore()
      if (cellarRef.current) {
        cellarRef.current.style.transform = `translate(${(-mouse.x * 10).toFixed(2)}px, ${(-mouse.y * 6).toFixed(2)}px)`
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouse.tx = (e.clientX / W) * 2 - 1
      mouse.ty = (e.clientY / H) * 2 - 1
    }
    window.addEventListener('pointermove', onMove)

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      // แท็บถูกพัก / เฟรมกระตุก: จำกัด dt ไม่ให้ขวดกระโดด
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      step(dt)
      draw()
      raf = requestAnimationFrame(loop)
    }
    if (reduced) {
      // ลดการเคลื่อนไหว: วาดภาพนิ่งภาพเดียว (วาดใหม่เมื่อเปลี่ยนขนาดจอ)
      t = 3
      draw()
      const ro2 = new ResizeObserver(() => draw())
      ro2.observe(canvas)
      return () => {
        ro.disconnect()
        ro2.disconnect()
        window.removeEventListener('pointermove', onMove)
      }
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,var(--color-brand-600)_0%,var(--color-night-800)_45%,var(--color-night-900)_100%)]" />
      <Cellar svgRef={cellarRef} />
      <div
        className="motion-scene absolute top-[14%] left-1/2 h-[50vh] w-[70vw] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl"
        style={{ animation: 'glow-pulse 9s ease-in-out infinite' }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  )
}

/** ห้องเก็บไวน์จางๆ: ซุ้มโค้ง 3 ช่อง ช่องข้างเป็นชั้นวางขวด (ก้นขวดเรียงกัน) */
function Cellar({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const arch = (x0: number, x1: number, top: number) => {
    const r = (x1 - x0) / 2
    return `M${x0} 900V${top + r}A${r} ${r} 0 0 1 ${x1} ${top + r}V900Z`
  }
  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMax slice"
      className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] will-change-transform"
    >
      <defs>
        <pattern id="rack" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="13" cy="13" r="9" fill="rgba(0,0,0,0.32)" stroke="rgba(255,190,210,0.07)" strokeWidth="1.2" />
          <circle cx="13" cy="13" r="3.2" fill="rgba(255,190,210,0.05)" />
        </pattern>
        <linearGradient id="arch-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.75" stopColor="#fff" stopOpacity="0.25" />
        </linearGradient>
        <mask id="arch-mask">
          <rect width="1440" height="900" fill="url(#arch-fade)" />
        </mask>
        <radialGradient id="door" cx="0.5" cy="0.25" r="0.75">
          <stop offset="0" stopColor="rgba(255,170,200,0.10)" />
          <stop offset="1" stopColor="rgba(255,170,200,0)" />
        </radialGradient>
      </defs>
      <g mask="url(#arch-mask)" opacity="0.9">
        {[arch(40, 420, 170), arch(1020, 1400, 170)].map((d) => (
          <g key={d}>
            <path d={d} fill="url(#rack)" />
            <path d={d} fill="none" stroke="rgba(255,190,210,0.10)" strokeWidth="3" />
          </g>
        ))}
        <path d={arch(500, 940, 70)} fill="url(#door)" stroke="rgba(255,190,210,0.08)" strokeWidth="3" />
      </g>
    </svg>
  )
}
