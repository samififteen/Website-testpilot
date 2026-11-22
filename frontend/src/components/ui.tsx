import { ChevronDown, Loader2, X } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'
import { useEffect } from 'react'
import type { ResultStatus, Severity, TestStatus } from '../types'
import type { Meta } from '../lib/format'
import { RESULT_META, SEVERITY_META, STATUS_META } from '../lib/format'

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[#1b1916] text-[#fbf9f4] border border-[#1b1916] hover:bg-[#332f28]',
  secondary:
    'bg-[#fbf9f4] text-[#26231f] border border-[#d6cdbb] hover:border-[#b7ad9a] hover:bg-[#f7f4ed]',
  ghost:
    'bg-transparent text-[#57524a] border border-transparent hover:bg-[#1b1916]/[0.05] hover:text-[#1b1916]',
  danger: 'bg-[#b3263c]/[0.06] text-[#a8233a] border border-[#b3263c]/25 hover:bg-[#b3263c]/[0.11]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-1.5 rounded-[4px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[12.5px]',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  className?: string
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div {...rest} className={cn('card', className)}>
      {children}
    </div>
  )
}

export function Badge({ meta, children }: { meta: Meta; children?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-[3px] text-[10.5px] font-medium leading-[13px]',
        meta.bg,
        meta.border,
        meta.text,
      )}
    >
      <span className={cn('size-[4px] rounded-full', meta.dot)} aria-hidden />
      {children ?? meta.label}
    </span>
  )
}

export function StatusBadge({ status }: { status: TestStatus }) {
  return <Badge meta={STATUS_META[status] ?? STATUS_META.pending} />
}

export function ResultBadge({ status }: { status: ResultStatus }) {
  return <Badge meta={RESULT_META[status] ?? RESULT_META.info} />
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge meta={SEVERITY_META[severity] ?? SEVERITY_META.info} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid size-9 place-items-center rounded-[4px] border border-[#ddd6c8] bg-[#f7f4ed] text-[#6f6a5f]">
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-medium text-[#1b1916]">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-[#6b665c]">
          {description}
        </p>
      </div>
      {action}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[11.5px] font-medium text-[#4a453d]">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-[#a8233a]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[10.5px] leading-relaxed text-[#756f62]">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'focus-ring h-9 w-full rounded-[4px] border border-[#d6cdbb] bg-[#fdfcf8] px-2.5 text-[13px] text-[#1b1916] placeholder:text-[#9c968a] transition-colors hover:border-[#b7ad9a] focus:border-[#756f62]'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, className)} />
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative block', className ?? 'w-full')}>
      <select {...props} className={cn(CONTROL, 'appearance-none bg-[#fdfcf8] pr-8')}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756f62]"
        aria-hidden
      />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[4px] border border-[#ddd6c8] bg-[#fdfcf8] px-3 py-2.5 transition-colors hover:border-[#c3b9a6]">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#26231f]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#6b665c]">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'focus-ring relative mt-0.5 h-[18px] w-[32px] shrink-0 rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-[#1b1916] bg-[#1b1916]' : 'border-[#c3b9a6] bg-[#e9e4d8]',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] size-[12px] rounded-full bg-[#fbf9f4] shadow-[0_1px_1px_rgba(27,25,22,0.2)] transition-all',
            checked ? 'left-[16px]' : 'left-[2px] bg-[#756f62]',
          )}
        />
      </button>
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1b1916]/35 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          'animate-in relative max-h-[90vh] w-full overflow-auto rounded-[6px] border border-[#ddd6c8] bg-[#fbf9f4] p-5 shadow-[0_24px_60px_-24px_rgba(27,25,22,0.35)] scroll-thin',
          wide ? 'max-w-4xl' : 'max-w-md',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-[13px] font-medium text-[#1b1916]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-[3px] p-1 text-[#756f62] hover:text-[#1b1916]"
            aria-label="Close dialog"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-[#6b665c]" role="status">
      <Loader2 className="size-3.5 animate-spin text-[#6b665c]" aria-hidden />
      {label}
    </div>
  )
}
