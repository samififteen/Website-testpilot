import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  message?: string
}

interface ToastContextValue {
  push: (tone: ToastTone, title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONE = {
  success: { icon: CheckCircle2, className: 'text-emerald-700', bar: 'bg-emerald-600' },
  error: { icon: AlertTriangle, className: 'text-rose-700', bar: 'bg-rose-600' },
  info: { icon: Info, className: 'text-sky-700', bar: 'bg-sky-600' },
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (tone: ToastTone, title: string, message?: string) => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current.slice(-3), { id, tone, title, message }])
      window.setTimeout(() => dismiss(id), 5200)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-5 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => {
          const tone = TONE[toast.tone]
          const Icon = tone.icon
          return (
            <div
              key={toast.id}
              className="animate-in card flex items-start gap-3 overflow-hidden px-4 py-3"
              role="status"
            >
              <span className={`absolute left-0 top-0 h-full w-0.5 ${tone.bar}`} aria-hidden />
              <Icon className={`mt-0.5 size-4 shrink-0 ${tone.className}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#171512]">{toast.title}</p>
                {toast.message ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-[#6b665c]">{toast.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="focus-ring rounded p-0.5 text-[#6b665c] hover:text-[#26231f]"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
