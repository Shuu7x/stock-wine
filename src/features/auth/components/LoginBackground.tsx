import { useEffect, useId, useState, type CSSProperties } from 'react'

// ─── คลื่น ────────────────────────────────────────────────────────────────────
const W = 1440

/** path คลื่น sine กว้าง 2 เท่าของจอ เลื่อนไป -50% แล้ววนได้ไม่สะดุด */
function wavePath(height: number, amp: number, waves: number, phase: number) {
  const len = W / waves
  const pts: string[] = [`M0 ${height}`]
  for (let x = 0; x <= W * 2; x += 12) {
    const y = amp + amp * Math.sin((x / len) * Math.PI * 2 + phase)
    pts.push(`L${x} ${y.toFixed(1)}`)
  }
  pts.push(`L${W * 2} ${height}`, 'Z')
  return pts.join(' ')
}

const LAYERS = [
  // ชั้นหลังสุด → หน้าสุด
  { height: 46, amp: 22, waves: 2, phase: 0, color: 'var(--color-wine-deep)', opacity: 0.55, dur: 26 },
  { height: 40, amp: 18, waves: 3, phase: 1.2, color: 'var(--color-wine-red)', opacity: 0.6, dur: 19 },
  { height: 32, amp: 16, waves: 2, phase: 2.4, color: 'var(--color-brand-700)', opacity: 0.7, dur: 14 },
  { height: 24, amp: 12, waves: 4, phase: 0.6, color: 'var(--color-wine-red)', opacity: 0.85, dur: 10 },
] as const

function Wave({ layer, reverse }: { layer: (typeof LAYERS)[number]; reverse?: boolean }) {
  const h = 200
  return (
    <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: `${layer.height}%` }}>
      <svg
        viewBox={`0 0 ${W * 2} ${h}`}
        preserveAspectRatio="none"
        className="absolute top-0 left-0 h-full w-[200%]"
        style={{
          animation: `wave-flow ${layer.dur}s linear infinite`,
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
        aria-hidden
      >
        <path d={wavePath(h, layer.amp, layer.waves, layer.phase)} fill={layer.color} fillOpacity={layer.opacity} />
      </svg>
    </div>
  )
}

// ─── ขวดไวน์ ──────────────────────────────────────────────────────────────────
const KINDS = [
  { glass: 'var(--color-bottle-green)', wine: 'var(--color-wine-red)', label: 'var(--color-gold-100)' },
  { glass: 'var(--color-bottle-green)', wine: 'var(--color-wine-deep)', label: 'var(--color-surface)' },
  { glass: 'var(--color-bottle-clear)', wine: 'var(--color-wine-rose)', label: 'var(--color-surface)' },
  { glass: 'var(--color-bottle-clear)', wine: 'var(--color-wine-white)', label: 'var(--color-gold-100)' },
  { glass: 'var(--color-bottle-amber)', wine: 'var(--color-wine-white)', label: 'var(--color-gold-100)' },
] as const

function BottleSvg({ kind, fill }: { kind: (typeof KINDS)[number]; fill: number }) {
  // ระดับไวน์ในขวด (fill 0.3–0.9)
  const top = 40 + (1 - fill) * 66
  const clip = useId()
  return (
    <svg viewBox="0 0 40 120" className="h-full w-auto drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <path d="M15 4h10v26c0 4 9 8 9 18v64a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V48c0-10 9-14 9-18z" />
        </clipPath>
      </defs>
      <path
        d="M15 4h10v26c0 4 9 8 9 18v64a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V48c0-10 9-14 9-18z"
        fill={kind.glass}
        fillOpacity={0.9}
      />
      <rect x="0" y={top} width="40" height="120" fill={kind.wine} fillOpacity={0.85} clipPath={`url(#${clip})`} />
      <rect x="14" y="1" width="12" height="9" rx="1.5" fill="var(--color-gold-500)" />
      <rect x="9" y="62" width="22" height="26" rx="2" fill={kind.label} fillOpacity={0.92} />
      <rect x="13" y="68" width="14" height="2" rx="1" fill={kind.wine} fillOpacity={0.7} />
      <rect x="15" y="74" width="10" height="1.5" rx="0.75" fill="var(--color-muted)" fillOpacity={0.6} />
      <path d="M10 50v56" stroke="white" strokeOpacity={0.25} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

type Bottle = {
  key: number
  kind: number
  fill: number
  size: number // vh
  y: number // % จากบน
  dur: number // วินาทีที่ใช้ข้ามจอ
  delay: number
  ltr: boolean
  r0: number
  r1: number
  bob: number
  bobDur: number
  /** ความลึก 0 (ไกล) – 2 (ใกล้): ขวดอยู่หลังคลื่นชั้น LAYERS[depth + 1] */
  depth: 0 | 1 | 2
}

let seq = 0
const rand = (a: number, b: number) => a + Math.random() * (b - a)

// ระดับผิวน้ำเฉลี่ย (% จากบนจอ) ของคลื่นแต่ละชั้น คำนวณจาก LAYERS
const surface = (l: (typeof LAYERS)[number]) => 100 - l.height + (l.amp / 200) * l.height

// แต่ละระดับความลึก: ขนาด (vh) และเวลาข้ามจอ (วินาที) — ไกล = เล็กและช้า
const DEPTHS = [
  { size: [6, 8.5], dur: [42, 58], opacity: 0.75 },
  { size: [9, 12], dur: [30, 42], opacity: 0.9 },
  { size: [12, 16], dur: [22, 32], opacity: 1 },
] as const

function randomBottle(initial: boolean): Bottle {
  const r = Math.random()
  const depth = (r < 0.35 ? 0 : r < 0.7 ? 1 : 2) as Bottle['depth']
  const d = DEPTHS[depth]
  const size = rand(d.size[0], d.size[1])
  // กลางขวดอยู่ใต้ผิวคลื่นชั้นที่อยู่หน้ามันเล็กน้อย → ขวดลอยปริ่มน้ำ โผล่แค่คอ/ไหล่ ครึ่งล่างจมในไวน์
  const center = surface(LAYERS[depth + 1]) + rand(0.5, 4)
  return {
    key: ++seq,
    kind: Math.floor(Math.random() * KINDS.length),
    fill: Math.round(rand(0.3, 0.9) * 10) / 10,
    size,
    y: center - size * 0.55,
    dur: rand(d.dur[0], d.dur[1]),
    // ตอนเปิดหน้า ให้บางขวดอยู่กลางจอแล้ว (delay ติดลบ) ที่เหลือทยอยมา
    delay: initial ? -rand(0, d.dur[0]) : rand(0, 6),
    ltr: Math.random() < 0.7,
    r0: rand(-12, 12),
    r1: rand(-12, 12),
    bob: rand(-10, -4),
    bobDur: rand(2.8, 5),
    depth,
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

function FloatingBottle({ b, onDone, reduced, index }: { b: Bottle; onDone: () => void; reduced: boolean; index: number }) {
  // CSS variable (--from ฯลฯ) ไม่อยู่ใน type CSSProperties จึงประกาศเป็น object ทั่วไปก่อน
  const vars: Record<string, string | number> = {
    top: `${b.y}%`,
    height: `${b.size}vh`,
    '--from': b.ltr ? '-20vw' : '110vw',
    '--to': b.ltr ? '110vw' : '-20vw',
    '--r0': `${b.r0}deg`,
    '--r1': `${b.r1}deg`,
    '--bob': `${b.bob}px`,
    // ลดการเคลื่อนไหว: วางนิ่งกระจายตามแนวนอน
    ...(reduced
      ? { left: `${8 + ((index * 23) % 84)}%` }
      : { left: 0, animation: `bottle-drift ${b.dur}s linear ${b.delay}s 1 both` }),
    opacity: DEPTHS[b.depth].opacity,
  }
  const style = vars as CSSProperties
  return (
    <div className="absolute" style={style} onAnimationEnd={(e) => e.animationName === 'bottle-drift' && onDone()}>
      <div
        className="h-full"
        style={{ animation: `bottle-bob ${b.bobDur}s ease-in-out infinite`, transformOrigin: '50% 60%' }}
      >
        <BottleSvg kind={KINDS[b.kind]} fill={b.fill} />
      </div>
    </div>
  )
}

/** ฉากหลังหน้า login: ไวน์ไหลเป็นคลื่น และขวดไวน์ลอยผ่าน (สุ่มจำนวน ชนิด ขนาด ทิศทาง) */
export function LoginBackground() {
  const reduced = useReducedMotion()
  const [bottles, setBottles] = useState<Bottle[]>(() =>
    Array.from({ length: Math.floor(rand(5, 10)) }, () => randomBottle(true)),
  )

  // ขวดลอยพ้นจอแล้ว → สุ่มขวดใหม่มาแทน บางครั้งได้ 0 หรือ 2 ขวด จำนวนบนจอจึงเปลี่ยนไปเรื่อยๆ (3–12)
  function respawn(key: number) {
    setBottles((bs) => {
      const rest = bs.filter((b) => b.key !== key)
      const r = Math.random()
      const n = rest.length < 3 ? 2 : rest.length > 11 ? 0 : r < 0.15 ? 0 : r > 0.85 ? 2 : 1
      return [...rest, ...Array.from({ length: n }, () => randomBottle(false))]
    })
  }

  const at = (depth: Bottle['depth']) =>
    bottles
      .filter((b) => b.depth === depth)
      .map((b, i) => (
        <FloatingBottle key={b.key} b={b} index={i * 3 + depth} reduced={reduced} onDone={() => respawn(b.key)} />
      ))

  return (
    <div className="motion-scene pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,var(--color-brand-600)_0%,var(--color-night-800)_45%,var(--color-night-900)_100%)]" />
      <div
        className="absolute top-[18%] left-1/2 h-[50vh] w-[70vw] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl"
        style={{ animation: 'glow-pulse 9s ease-in-out infinite' }}
      />
      {/* คลื่นหลัง → ขวดไกล → คลื่น → ขวดกลาง → คลื่น → ขวดใกล้ → คลื่นหน้าสุด */}
      <Wave layer={LAYERS[0]} />
      {at(0)}
      <Wave layer={LAYERS[1]} reverse />
      {at(1)}
      <Wave layer={LAYERS[2]} />
      {at(2)}
      <Wave layer={LAYERS[3]} reverse />
    </div>
  )
}
