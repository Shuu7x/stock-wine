import { cn } from '@/lib/cn'

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  /** ข้อความสำหรับ screen reader */
  label: string
  id?: string
  disabled?: boolean
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50',
        checked ? 'bg-brand-700' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-surface shadow transition',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
