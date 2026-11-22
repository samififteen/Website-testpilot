import type { ResultStatus, Severity, TestStatus } from '../types'

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  if (Number.isNaN(diff)) return '—'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(value)
}

export function shortUrl(url: string, max = 44): string {
  try {
    const parsed = new URL(url)
    const value = `${parsed.host}${parsed.pathname}${parsed.search}`
    return value.length > max ? `${value.slice(0, max - 1)}…` : value
  } catch {
    return url
  }
}

export interface Meta {
  label: string
  text: string
  bg: string
  border: string
  dot: string
}

export const STATUS_META: Record<TestStatus, Meta> = {
  pending: {
    label: 'Pending',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-400',
  },
  queued: {
    label: 'Queued',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-400',
  },
  running: {
    label: 'Running',
    text: 'text-indigo-300',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-400/40',
    dot: 'bg-indigo-400',
  },
  passed: {
    label: 'Passed',
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-400/30',
    dot: 'bg-emerald-400',
  },
  failed: {
    label: 'Failed',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-400/30',
    dot: 'bg-rose-400',
  },
  warnings: {
    label: 'Warnings',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-400/30',
    dot: 'bg-amber-400',
  },
  cancelled: {
    label: 'Cancelled',
    text: 'text-slate-400',
    bg: 'bg-slate-600/10',
    border: 'border-slate-600/40',
    dot: 'bg-slate-500',
  },
  error: {
    label: 'Error',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-400/30',
    dot: 'bg-rose-400',
  },
}

export const RESULT_META: Record<ResultStatus, Meta> = {
  passed: STATUS_META.passed,
  failed: STATUS_META.failed,
  warning: { ...STATUS_META.warnings, label: 'Warning' },
  skipped: {
    label: 'Skipped',
    text: 'text-[#a4abba]',
    bg: 'bg-white/[0.03]',
    border: 'border-[#3a4150]',
    dot: 'bg-[#5f6776]',
  },
  info: {
    label: 'Info',
    text: 'text-sky-300',
    bg: 'bg-sky-500/10',
    border: 'border-sky-400/30',
    dot: 'bg-sky-400',
  },
}

export const SEVERITY_META: Record<Severity, Meta> = {
  critical: {
    label: 'Critical',
    text: 'text-rose-300',
    bg: 'bg-rose-500/10',
    border: 'border-rose-400/30',
    dot: 'bg-rose-400',
  },
  high: {
    label: 'High',
    text: 'text-orange-300',
    bg: 'bg-orange-500/10',
    border: 'border-orange-400/30',
    dot: 'bg-orange-400',
  },
  medium: {
    label: 'Medium',
    text: 'text-amber-300',
    bg: 'bg-amber-500/10',
    border: 'border-amber-400/30',
    dot: 'bg-amber-400',
  },
  low: {
    label: 'Low',
    text: 'text-sky-300',
    bg: 'bg-sky-500/10',
    border: 'border-sky-400/30',
    dot: 'bg-sky-400',
  },
  info: {
    label: 'Info',
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-400',
  },
}

export function scoreTone(score: number | null | undefined): {
  text: string
  ring: string
  label: string
} {
  if (score === null || score === undefined) return { text: 'text-slate-400', ring: '#475569', label: 'No data' }
  if (score >= 90) return { text: 'text-emerald-300', ring: '#34d399', label: 'Healthy' }
  if (score >= 70) return { text: 'text-amber-300', ring: '#fbbf24', label: 'Needs attention' }
  return { text: 'text-rose-300', ring: '#fb7185', label: 'At risk' }
}
