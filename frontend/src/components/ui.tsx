import { ChevronDown, Loader2, X } from 'lucide-react'
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'
import { useCallback, useEffect, useRef } from 'react'
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
  primary:
    'bg-[#eef0f7] text-[#0a0b10] border border-white/10 hover:bg-white shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_10px_24px_-16px_rgba(238,240,247,0.9)]',
  secondary:
    'bg-[#11141b] text-[#dcdfe8] border border-[#262b38] hover:border-[#3a4155] hover:bg-[#151922]',
  ghost: 'bg-transparent text-[#a4abba] border border-transparent hover:bg-white/[0.045] hover:text-[#e9eaf0]',
  danger:
    'bg-[#fb7185]/[0.08] text-[#fda4af] border border-[#fb7185]/[0.25] hover:bg-[#fb7185]/[0.14]',
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
        'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-8 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]',
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
  spotlight?: boolean
}

export function Card({ children, className, spotlight = false, ...rest }: CardProps) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const node = ref.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    node.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    node.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }, [])

  return (
    <div
      ref={ref}
      onMouseMove={spotlight ? onMove : undefined}
      {...rest}
      className={cn('card', spotlight && 'spotlight card-hover', className)}
    >
      {children}
    </div>
  )
}

export function Badge({ meta, children }: { meta: Meta; children?: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[5px] border px-1.5 py-[2px] font-mono text-[10px] uppercase leading-[14px] tracking-[0.06em]',
        meta.bg,
        meta.border,
        meta.text,
      )}
    >
      <span className={cn('size-[5px] rounded-full', meta.dot)} aria-hidden />
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
      <div className="grid size-10 place-items-center rounded-lg border border-[#262b38] bg-[#10131a] text-[#8b93a3]">
        {icon}
      </div>
      <div>
        <p className="text-[13px] font-medium text-[#e2e5ee]">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-[11.5px] leading-relaxed text-[#7d8595]">
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
      <label
        htmlFor={htmlFor}
        className="block font-mono text-[10px] uppercase tracking-[0.1em] text-[#8b93a3]"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] text-[#fda4af]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[10.5px] leading-relaxed text-[#626b7a]">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'focus-ring h-9 w-full rounded-lg border border-[#242936] bg-[#0a0c11] px-2.5 text-[13px] text-[#e9eaf0] placeholder:text-[#4f5765] transition-colors hover:border-[#333a4a] focus:border-[#47506a]'

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
      <select {...props} className={cn(CONTROL, 'appearance-none bg-[#0a0c11] pr-8')}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#5f6776]"
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
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[#1e222c] bg-[#0a0c11] px-3 py-2.5 transition-colors hover:border-[#2a3040]">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#d6dae4]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#6b7280]">{description}</p>
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
          checked ? 'border-[#7c86ff]/50 bg-[#5b64e8]' : 'border-[#2f3542] bg-[#171b24]',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] size-[12px] rounded-full bg-white transition-all',
            checked ? 'left-[16px]' : 'left-[2px]',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          'animate-in relative max-h-[90vh] w-full overflow-auto rounded-xl border border-[#262b38] bg-[#0b0d12] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)] scroll-thin',
          wide ? 'max-w-4xl' : 'max-w-md',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-[13px] font-medium text-[#e9eaf0]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded p-1 text-[#6a7280] hover:text-[#e9eaf0]"
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
    <div className="flex items-center gap-2 text-[11px] text-[#8b93a3]" role="status">
      <Loader2 className="size-3.5 animate-spin text-[#8b93a3]" aria-hidden />
      {label}
    </div>
  )
}
