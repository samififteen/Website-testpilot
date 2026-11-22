import {
  Download,
  Eye,
  FileBarChart,
  FileJson,
  Play,
  Search,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import {
  Button,
  Card,
  EmptyState,
  Input,
  Skeleton,
  StatusBadge,
  cn,
} from '../components/ui'
import { PageHeader } from '../layouts/Layout'
import { formatDate, formatDuration, scoreTone, shortUrl } from '../lib/format'
import type { TestExecution } from '../types'

export function Reports() {
  const [items, setItems] = useState<TestExecution[]>([])
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.listTests({
        page: 1,
        page_size: 24,
        status: 'passed,failed,warnings',
        search: search || undefined,
        sort: 'created_at',
        order: 'desc',
      })
      setItems(result.items)
      setTotal(result.total)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <PageHeader
        eyebrow="Deliverables"
        title="Test reports"
        description="Completed executions with stored findings and exportable JSON / HTML reports."
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

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756f62]" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search reports"
            className="pl-8 text-xs"
            aria-label="Search reports"
          />
        </div>
        <span className="text-[11px] text-[#6b665c]">{total} completed run(s)</span>
      </div>

      {error ? (
        <Card className="mb-4 border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-800">{error}</Card>
      ) : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileBarChart className="size-5" />}
            title="No completed reports yet"
            description="Reports are created when a run finishes. Start a test against a site you own to generate one."
            action={
              <Link to="/new">
                <Button size="sm" icon={<Play className="size-3.5" />}>
                  Run a test
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((run) => {
            const tone = scoreTone(run.health_score)
            return (
              <Card key={run.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#171512]">
                      {run.name || run.page_title || shortUrl(run.url)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#6b665c]">{run.url}</p>
                  </div>
                  <StatusBadge status={run.status} />
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="rounded-lg border border-[#ddd6c8] bg-[#fdfcf8] px-2.5 py-1.5 text-center">
                    <p className={cn('text-lg font-semibold', tone.text)}>{run.health_score ?? '—'}</p>
                    <p className="text-[9px] text-[#756f62]">health</p>
                  </div>
                  <div className="grid flex-1 grid-cols-3 gap-1 text-center text-[11px]">
                    {[
                      { label: 'pass', value: run.counts.passed, text: 'text-emerald-700', bg: 'bg-emerald-500/[0.07]' },
                      { label: 'fail', value: run.counts.failed, text: 'text-rose-700', bg: 'bg-rose-500/[0.07]' },
                      { label: 'warn', value: run.counts.warnings, text: 'text-amber-700', bg: 'bg-amber-500/[0.07]' },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className={cn('rounded-md py-1', stat.value > 0 ? stat.bg : 'bg-[#1b1916]/[0.02]')}
                      >
                        <p className={cn('font-medium', stat.value > 0 ? stat.text : 'text-[#6b665c]')}>
                          {stat.value}
                        </p>
                        <p className="text-[9px] text-[#756f62]">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="mt-2.5 text-[10px] text-[#6b665c]">
                  {formatDate(run.created_at)} · {formatDuration(run.duration_ms)}
                </p>

                <div className="mt-auto flex items-center gap-1.5 pt-3">
                  <Link to={`/reports/${run.id}`} className="flex-1">
                    <Button size="sm" variant="secondary" className="w-full" icon={<Eye className="size-3.5" />}>
                      Open report
                    </Button>
                  </Link>
                  <a
                    href={api.exportJsonUrl(run.id)}
                    download
                    className="focus-ring rounded-lg border border-[#d6cdbb] p-1.5 text-[#6b665c] hover:text-[#26231f]"
                    aria-label="Export JSON"
                    title="Export JSON"
                  >
                    <FileJson className="size-3.5" />
                  </a>
                  <a
                    href={api.exportHtmlUrl(run.id)}
                    download
                    className="focus-ring rounded-lg border border-[#d6cdbb] p-1.5 text-[#6b665c] hover:text-[#26231f]"
                    aria-label="Export HTML"
                    title="Export HTML"
                  >
                    <Download className="size-3.5" />
                  </a>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
