import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  History as HistoryIcon,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useToast } from '../components/Toast'
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  StatusBadge,
  cn,
} from '../components/ui'
import { PageHeader } from '../layouts/Layout'
import type { TestExecution } from '../types'
import { formatDate, formatDuration, shortUrl } from '../lib/format'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'warnings', label: 'Warnings' },
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'error', label: 'Error' },
]

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Date' },
  { value: 'health_score', label: 'Health score' },
  { value: 'duration_ms', label: 'Duration' },
  { value: 'status', label: 'Status' },
  { value: 'url', label: 'URL' },
]

export function History() {
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<TestExecution[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(params.get('status') ?? 'all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TestExecution | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const pageSize = 10

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.listTests({
        page,
        page_size: pageSize,
        status,
        search: search || undefined,
        sort,
        order,
      })
      setItems(result.items)
      setTotal(result.total)
      setPages(result.pages)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load test history.')
    } finally {
      setLoading(false)
    }
  }, [page, status, search, sort, order])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const current = params.get('status') ?? 'all'
    if (current === status) return
    const next = new URLSearchParams(params)
    if (status === 'all') next.delete('status')
    else next.set('status', status)
    setParams(next, { replace: true })
  }, [status, params, setParams])

  const rerun = async (execution: TestExecution) => {
    setBusyId(execution.id)
    try {
      const created = await api.rerun(execution.id)
      toast.push('info', 'Re-run queued', 'The previous report is preserved unchanged.')
      navigate(`/reports/${created.id}`)
    } catch (err) {
      toast.push('error', 'Could not re-run', err instanceof ApiError ? err.message : 'Unknown error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      await api.deleteTest(deleteTarget.id)
      toast.push('success', 'Execution deleted', 'Results and screenshots were removed.')
      setDeleteTarget(null)
      if (items.length === 1 && page > 1) setPage(page - 1)
      else void load()
    } catch (err) {
      toast.push('error', 'Could not delete', err instanceof ApiError ? err.message : 'Unknown error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Archive"
        title="Test history"
        description="Every stored execution, with real counts, durations and health scores. Re-running never overwrites history."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} icon={<RefreshCw className="size-3.5" />}>
              Refresh
            </Button>
            <Link to="/new">
              <Button size="sm" icon={<Play className="size-3.5" />}>
                New test
              </Button>
            </Link>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[#14171e] p-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#5f6776]" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by URL, title or test name"
              className="pl-8"
              aria-label="Search test history"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setPage(1)
              }}
              className="w-40"
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="w-36"
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
              icon={order === 'desc' ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />}
              aria-label={order === 'desc' ? 'Descending' : 'Ascending'}
            >
              {order === 'desc' ? 'Newest' : 'Oldest'}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="border-b border-rose-500/20 bg-rose-500/5 px-4 py-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon className="size-5" />}
            title={search || status !== 'all' ? 'No matching executions' : 'No executions stored'}
            description={
              search || status !== 'all'
                ? 'Try a different search term or status filter.'
                : 'Run a test and every result, screenshot and report stays here.'
            }
            action={
              <Link to="/new">
                <Button size="sm" icon={<Play className="size-3.5" />}>
                  Start a test
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-[#6b7280]">
                <tr className="border-b border-[#14171e]">
                  <th className="px-4 py-2.5 font-medium">Website</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Passed</th>
                  <th className="px-3 py-2.5 font-medium">Failed</th>
                  <th className="px-3 py-2.5 font-medium">Duration</th>
                  <th className="px-3 py-2.5 font-medium">Health</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr key={run.id} className="border-b border-[#11141b] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <Link to={`/reports/${run.id}`} className="font-medium text-[#dcdfe8] hover:text-indigo-200">
                        {run.name || run.page_title || shortUrl(run.url)}
                      </Link>
                      <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-[#6b7280]">{run.url}</p>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-3 py-3 text-emerald-300">{run.counts.passed}</td>
                    <td className="px-3 py-3 text-rose-300">{run.counts.failed}</td>
                    <td className="px-3 py-3 text-[#8b93a3]">{formatDuration(run.duration_ms)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'font-medium',
                          run.health_score === null
                            ? 'text-[#6b7280]'
                            : run.health_score >= 90
                              ? 'text-emerald-300'
                              : run.health_score >= 70
                                ? 'text-amber-300'
                                : 'text-rose-300',
                        )}
                      >
                        {run.health_score ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#6b7280]">{formatDate(run.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/reports/${run.id}`}
                          className="focus-ring rounded-md p-1.5 text-[#8b93a3] hover:bg-white/5 hover:text-[#dcdfe8]"
                          aria-label={`View report for ${run.url}`}
                          title="View report"
                        >
                          <Eye className="size-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void rerun(run)}
                          disabled={busyId === run.id}
                          className="focus-ring rounded-md p-1.5 text-[#8b93a3] hover:bg-white/5 hover:text-indigo-200 disabled:opacity-40"
                          aria-label={`Re-run ${run.url}`}
                          title="Re-run with the same configuration"
                        >
                          <RefreshCw className={cn('size-3.5', busyId === run.id && 'animate-spin')} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(run)}
                          className="focus-ring rounded-md p-1.5 text-[#6b7280] hover:bg-rose-500/10 hover:text-rose-300"
                          aria-label={`Delete ${run.url}`}
                          title="Delete execution"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#14171e] px-4 py-2.5 text-[11px] text-[#6b7280]">
          <span>
            {total} execution{total === 1 ? '' : 's'} · page {page} of {pages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              icon={<ChevronLeft className="size-3.5" />}
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= pages || loading}
              onClick={() => setPage((current) => Math.min(pages, current + 1))}
              icon={<ChevronRight className="size-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete this execution?"
        onClose={() => setDeleteTarget(null)}
      >
        <p className="text-xs leading-relaxed text-[#8b93a3]">
          This permanently removes the execution{' '}
          <span className="font-mono text-[#c3c9d6]">{deleteTarget?.id}</span>, all of its test
          results and stored screenshots. Reports exported before deletion are not affected.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={busyId === deleteTarget?.id}
            onClick={() => void confirmDelete()}
            icon={<Trash2 className="size-3.5" />}
          >
            Delete permanently
          </Button>
        </div>
      </Modal>
    </div>
  )
}
