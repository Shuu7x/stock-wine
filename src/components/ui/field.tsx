import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export function Field({
  label,
  error,
  children,
  className,
}: {
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {error && <span className="text-xs text-danger-600">{error}</span>}
    </label>
  )
}
