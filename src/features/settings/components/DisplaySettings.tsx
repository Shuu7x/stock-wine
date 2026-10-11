import { Minus, Plus, RotateCcw, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { FONT_SCALE, setFontScale, useFontScale } from '@/lib/font-scale'
import { SettingsCard } from './SettingsLayout'

const PRESETS = [
  { value: 90, label: 'เล็ก' },
  { value: 100, label: 'ปกติ' },
  { value: 115, label: 'ใหญ่' },
  { value: 130, label: 'ใหญ่มาก' },
]

/** การแสดงผล (ต่อเครื่อง): ขนาดตัวหนังสือทั้งระบบ เลื่อนแล้วเห็นผลทันที */
export function DisplaySettings() {
  const scale = useFontScale()
  const { min, max, step } = FONT_SCALE
  const pct = ((scale - min) / (max - min)) * 100

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard
        title="ขนาดตัวหนังสือ"
        icon={Type}
        description="ปรับทั้งระบบ เห็นผลทันที · จำไว้เฉพาะเครื่องนี้ (แต่ละเครื่องตั้งต่างกันได้) · ไม่มีผลกับป้าย QR และบิลที่พิมพ์"
      >
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* แถบเลื่อน */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="เล็กลง"
              onClick={() => setFontScale(scale - step)}
              disabled={scale <= min}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand-200 text-brand-700 transition hover:bg-brand-50 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span aria-hidden className="shrink-0 text-xs font-semibold text-muted">
              ก
            </span>
            <div className="relative min-w-0 flex-1">
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={scale}
                onChange={(e) => setFontScale(Number(e.target.value))}
                aria-label="ขนาดตัวหนังสือ"
                aria-valuetext={`${scale}%`}
                className="font-range w-full"
                style={{ ['--fill' as string]: `${pct}%` }}
              />
              {/* ขีดบอกระดับ */}
              <div aria-hidden className="pointer-events-none mt-1 flex justify-between px-[9px]">
                {Array.from({ length: (max - min) / step + 1 }, (_, i) => min + i * step).map((v) => (
                  <span key={v} className={cn('h-1.5 w-px', v === 100 ? 'h-2.5 bg-brand-400' : 'bg-line-strong')} />
                ))}
              </div>
            </div>
            <span aria-hidden className="shrink-0 text-xl font-semibold text-muted">
              ก
            </span>
            <button
              type="button"
              aria-label="ใหญ่ขึ้น"
              onClick={() => setFontScale(scale + step)}
              disabled={scale >= max}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand-200 text-brand-700 transition hover:bg-brand-50 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
            <span className="w-14 shrink-0 text-right text-lg font-bold text-brand-800 tabular-nums">{scale}%</span>
          </div>

          {/* ขนาดสำเร็จรูป */}
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setFontScale(p.value)}
                aria-pressed={scale === p.value}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                  scale === p.value
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 ring-inset hover:bg-brand-100',
                )}
              >
                {p.label} <span className="opacity-70 tabular-nums">{p.value}%</span>
              </button>
            ))}
            {scale !== FONT_SCALE.default && (
              <Button size="sm" variant="ghost" onClick={() => setFontScale(FONT_SCALE.default)} className="ml-auto">
                <RotateCcw className="size-4" /> กลับเป็นปกติ
              </Button>
            )}
          </div>

          {/* ตัวอย่าง */}
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="mb-2 text-xs font-medium text-muted">ตัวอย่าง</div>
            <div className="font-display text-xl font-bold text-brand-900">Château Margaux 2015</div>
            <p className="mt-1 text-sm text-ink-2">Showroom Wines 1 · A1 · คงเหลือ 6 ขวด · ดื่มได้ 2030–2070</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="success">ดื่มได้</Badge>
              <Badge tone="warning">ใกล้หมด</Badge>
              <span className="text-sm font-semibold tabular-nums">฿38,500</span>
              <Button size="sm" variant="primary" className="ml-auto">
                บันทึกการขาย
              </Button>
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
