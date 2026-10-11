import { useEffect, useRef } from 'react'

/**
 * ฉากหน้า login: ผิวไวน์มองจากด้านบน กระเพื่อมจริง (จำลองคลื่นบน heightfield)
 * - ลากเมาส์/นิ้ว = คลื่นตามรอย · คลิก/แตะ = หยดไวน์ · นานๆ มีหยดตกเอง
 * - แสงโคมไฟสะท้อนบนผิว บิดตามคลื่น ทำให้ดูเป็นของเหลว
 * - tremble เปลี่ยนค่า: ผิวไวน์สั่นไหว (รหัสผิด)
 * - ตอนล็อกอินสำเร็จ: ดู reveal-transition.ts (ถ่ายภาพ canvas นี้ไปทำวงคลื่นเผยหน้าหลัก)
 */

const DAMP = 0.982

export function WineRipple({ tremble }: { tremble: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trembleAt = useRef<number | null>(null)

  useEffect(() => {
    if (tremble) trembleAt.current = performance.now()
  }, [tremble])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const buf = document.createElement('canvas')
    const bctx = buf.getContext('2d')!

    let W = 0
    let H = 0
    let cell = 4 // px ต่อช่องจำลอง
    let w = 0
    let h = 0
    let cur = new Float32Array(0)
    let prev = new Float32Array(0)
    let base = new Float32Array(0) // สีพื้น r,g,b ต่อช่อง
    let refl = new Float32Array(0) // ความสว่างแสงสะท้อนโคมไฟ
    let img: ImageData | null = null
    let nextDrop = 1
    let acc = 0
    const last = { x: -1, y: -1 }

    function resize() {
      W = canvas.clientWidth
      H = canvas.clientHeight
      cell = Math.max(3, Math.round(Math.min(W, H) / 220))
      w = Math.ceil(W / cell) + 2
      h = Math.ceil(H / cell) + 2
      cur = new Float32Array(w * h)
      prev = new Float32Array(w * h)
      base = new Float32Array(w * h * 3)
      refl = new Float32Array(w * h)
      buf.width = w
      buf.height = h
      img = bctx.createImageData(w, h)
      canvas.width = W
      canvas.height = H
      // พื้นไวน์: กลางบนสว่างอมแดง ขอบเข้มเกือบดำ
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          const dx = x / w - 0.5
          const dy = y / h - 0.35
          const d = Math.min(1, Math.hypot(dx * 1.1, dy * 1.3) * 1.6)
          const k = 1 - d * d
          base[i * 3] = 28 + 62 * k
          base[i * 3 + 1] = 4 + 10 * k
          base[i * 3 + 2] = 12 + 22 * k
          // โคมไฟสะท้อน: วงรีนุ่มขวาบน
          const lx = (x / w - 0.74) / 0.2
          const ly = (y / h - 0.2) / 0.14
          refl[i] = 0.6 * Math.exp(-(lx * lx + ly * ly) * 1.4)
        }
      }
    }

    function disturb(px: number, py: number, radius: number, strength: number) {
      const cx = px / cell
      const cy = py / cell
      const r = radius
      const x0 = Math.max(1, Math.floor(cx - r))
      const x1 = Math.min(w - 2, Math.ceil(cx + r))
      const y0 = Math.max(1, Math.floor(cy - r))
      const y1 = Math.min(h - 2, Math.ceil(cy + r))
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - cx, y - cy)
          if (d > r) continue
          cur[y * w + x] -= strength * (0.5 + 0.5 * Math.cos((d / r) * Math.PI))
        }
      }
    }

    function stepSim() {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - w] + cur[i + w]) * 0.5 - prev[i]) * DAMP
        }
      }
      const t = cur
      cur = prev
      prev = t
    }

    function render(glow: number) {
      const data = img!.data
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          const nx = cur[i - 1] - cur[i + 1]
          const ny = cur[i - w] - cur[i + w]
          // แสงสะท้อนโคมไฟ บิดตามความเอียงของผิว
          const rx = Math.min(w - 1, Math.max(0, Math.round(x + nx * 7)))
          const ry = Math.min(h - 1, Math.max(0, Math.round(y + ny * 7)))
          const r = refl[ry * w + rx]
          const light = nx * 0.55 + ny * 0.8
          const spec = light > 0 ? Math.min(110, light * light * 70) : 0
          const shade = light * 26
          const o = i * 4
          const b = i * 3
          data[o] = base[b] * glow + r * 150 + shade + spec
          data[o + 1] = base[b + 1] * glow + r * 70 + shade * 0.35 + spec * 0.85
          data[o + 2] = base[b + 2] * glow + r * 92 + shade * 0.5 + spec * 0.9
          data[o + 3] = 255
        }
      }
      bctx.putImageData(img!, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(buf, 1, 1, w - 2, h - 2, 0, 0, (w - 2) * cell, (h - 2) * cell)
    }

    function frame(dt: number, now: number) {
      // หยดไวน์ตกเองเป็นระยะ
      nextDrop -= dt
      if (nextDrop <= 0) {
        disturb(Math.random() * W, Math.random() * H, 2.5, 2.2)
        nextDrop = 1.4 + Math.random() * 2
      }
      if (trembleAt.current != null) {
        if (now - trembleAt.current < 380) {
          for (let k = 0; k < 4; k++) disturb(W * (0.3 + Math.random() * 0.4), H * (0.3 + Math.random() * 0.4), 1.6, 1.4)
        } else trembleAt.current = null
      }
      // จำลองที่ 60 ครั้ง/วินาที คงที่ ไม่ขึ้นกับ refresh rate
      acc += dt
      let n = 0
      while (acc >= 1 / 60 && n < 3) {
        stepSim()
        acc -= 1 / 60
        n++
      }
      render(1)
    }

    function trail(px: number, py: number) {
      if (last.x < 0) {
        last.x = px
        last.y = py
        return
      }
      const dist = Math.hypot(px - last.x, py - last.y)
      if (dist < 1) return
      const steps = Math.max(1, Math.ceil(dist / (cell * 2.5)))
      const strength = Math.min(1.4, 0.3 + (dist / steps) * 0.06)
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        disturb(last.x + (px - last.x) * t, last.y + (py - last.y) * t, 2.2, strength)
      }
      last.x = px
      last.y = py
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.buttons === 0) return
      trail(e.clientX, e.clientY)
    }
    const onDown = (e: PointerEvent) => {
      // คลิกบนการ์ดไม่ต้องหยด (กำลังพิมพ์/กดปุ่ม)
      if ((e.target as HTMLElement).closest('form')) return
      disturb(e.clientX, e.clientY, 3.5, 5)
      last.x = e.clientX
      last.y = e.clientY
    }
    const onLeave = () => (last.x = -1)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerleave', onLeave)

    resize()
    let resizeTimer = 0
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resize()
        if (reduced) render(1)
      }, 80)
    })
    ro.observe(canvas)

    let raf = 0
    if (reduced) {
      // ภาพนิ่ง: วงคลื่นจางๆ สองสามวง
      disturb(W * 0.3, H * 0.65, 4, 6)
      disturb(W * 0.75, H * 0.3, 3, 4)
      for (let k = 0; k < 40; k++) stepSim()
      render(1)
    } else {
      let prevT = performance.now()
      const loop = (now: number) => {
        const dt = Math.min(0.05, (now - prevT) / 1000)
        prevT = now
        frame(dt, now)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.5)_100%)]" />
    </div>
  )
}
