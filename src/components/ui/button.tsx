import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-300',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2 disabled:text-muted',
  ghost: 'text-ink-2 hover:bg-surface-3 disabled:text-muted',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }
>(function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed',
        'focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
})
