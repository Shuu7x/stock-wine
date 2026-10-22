import type { ReactNode } from 'react'
import { Skeleton } from './loading'
import { TourButton } from '@/features/tour/TourButton'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="font-display text-2xl font-bold text-brand-900 sm:text-[28px]">{title}</h1>
          <TourButton />
        </div>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, loading }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="truncate text-xs text-muted">{label}</div>
      {loading ? (
        <Skeleton className="mt-1.5 mb-1 h-5 w-2/3 sm:h-6" />
      ) : (
        <>
          <div className="mt-0.5 truncate text-lg font-semibold tabular-nums sm:text-xl">{value}</div>
          {hint && <div className="truncate text-xs text-muted">{hint}</div>}
        </>
      )}
    </div>
  )
}
