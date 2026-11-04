import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-lg border border-line bg-surface px-3 text-fg placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-danger'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
  className?: string
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  const descId = `${id}-d`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? descId : undefined })}
      {(error || hint) && (
        <p id={descId} className={cn('text-xs', error ? 'text-danger' : 'text-faint')} role={error ? 'alert' : undefined}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(control, 'h-11 md:h-10', className)} {...p} />
)
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'h-11 md:h-10', className)} {...p} />
)
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(control, 'min-h-20 py-2.5', className)} {...p} />
)

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg"
    >
      <span className={cn('relative h-6 w-10 shrink-0 rounded-full border transition-colors', checked ? 'border-accent bg-accent' : 'border-line-strong bg-raised')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full transition-all', checked ? 'left-[18px] bg-on-accent' : 'left-0.5 bg-fg')} />
      </span>
      {label}
    </button>
  )
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-9 cursor-pointer rounded-md px-3 text-sm transition-colors',
            o.value === value ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
