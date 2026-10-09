import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'gold'

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  brand: 'bg-brand-100 text-brand-800',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-600',
  gold: 'bg-gold-100 text-gold-700',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
