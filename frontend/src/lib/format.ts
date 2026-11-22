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
    text: 'text-slate-700',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-600',
  },
  queued: {
    label: 'Queued',
    text: 'text-slate-700',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-600',
  },
  running: {
    label: 'Running',
    text: 'text-indigo-700',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-600/40',
    dot: 'bg-indigo-600',
  },
  passed: {
    label: 'Passed',
    text: 'text-emerald-700',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-600/30',
    dot: 'bg-emerald-600',
  },
  failed: {
    label: 'Failed',
    text: 'text-rose-700',
    bg: 'bg-rose-500/10',
    border: 'border-rose-600/30',
    dot: 'bg-rose-600',
  },
  warnings: {
    label: 'Warnings',
    text: 'text-amber-700',
    bg: 'bg-amber-500/10',
    border: 'border-amber-600/30',
    dot: 'bg-amber-600',
  },
  cancelled: {
    label: 'Cancelled',
    text: 'text-slate-600',
    bg: 'bg-slate-600/10',
    border: 'border-slate-600/40',
    dot: 'bg-slate-500',
  },
  error: {
    label: 'Error',
    text: 'text-rose-700',
    bg: 'bg-rose-500/10',
    border: 'border-rose-600/30',
    dot: 'bg-rose-600',
  },
}

export const RESULT_META: Record<ResultStatus, Meta> = {
  passed: STATUS_META.passed,
  failed: STATUS_META.failed,
  warning: { ...STATUS_META.warnings, label: 'Warning' },
  skipped: {
    label: 'Skipped',
    text: 'text-[#57524a]',
    bg: 'bg-[#1b1916]/[0.03]',
    border: 'border-[#3a4150]',
    dot: 'bg-[#8d877a]',
  },
  info: {
    label: 'Info',
    text: 'text-sky-700',
    bg: 'bg-sky-500/10',
    border: 'border-sky-600/30',
    dot: 'bg-sky-600',
  },
}

export const SEVERITY_META: Record<Severity, Meta> = {
  critical: {
    label: 'Critical',
    text: 'text-rose-700',
    bg: 'bg-rose-500/10',
    border: 'border-rose-600/30',
    dot: 'bg-rose-600',
  },
  high: {
    label: 'High',
    text: 'text-orange-700',
    bg: 'bg-orange-500/10',
    border: 'border-orange-600/30',
    dot: 'bg-orange-600',
  },
  medium: {
    label: 'Medium',
    text: 'text-amber-700',
    bg: 'bg-amber-500/10',
    border: 'border-amber-600/30',
    dot: 'bg-amber-600',
  },
  low: {
    label: 'Low',
    text: 'text-sky-700',
    bg: 'bg-sky-500/10',
    border: 'border-sky-600/30',
    dot: 'bg-sky-600',
  },
  info: {
    label: 'Info',
    text: 'text-slate-700',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    dot: 'bg-slate-600',
  },
}

export function scoreTone(score: number | null | undefined): {
  text: string
  ring: string
  label: string
} {
  if (score === null || score === undefined) return { text: 'text-slate-600', ring: '#475569', label: 'No data' }
  if (score >= 90) return { text: 'text-emerald-700', ring: '#34d399', label: 'Healthy' }
  if (score >= 70) return { text: 'text-amber-700', ring: '#fbbf24', label: 'Needs attention' }
  return { text: 'text-rose-700', ring: '#b3263c', label: 'At risk' }
}
