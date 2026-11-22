import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronDown,
  Download,
  ExternalLink,
  FileJson,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useToast } from '../components/Toast'
import {
  Button,
  Card,
  EmptyState,
  Modal,
  ResultBadge,
  Select,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  cn,
} from '../components/ui'
import { formatDateTime, formatDuration, scoreTone, shortUrl } from '../lib/format'
import type { ReportResponse, ResultStatus, Screenshot, TestResultItem } from '../types'

const TABS = [
  { key: 'all', label: 'All checks' },
  { key: 'passed', label: 'Passed' },
  { key: 'failed', label: 'Failed' },
  { key: 'warnings', label: 'Warnings' },
  { key: 'skipped', label: 'Skipped' },
] as const

type TabKey = (typeof TABS)[number]['key']

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low', 'info']

export function Report() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('all')
  const [severity, setSeverity] = useState('all')
  const [detail, setDetail] = useState<TestResultItem | null>(null)
  const [viewingShot, setViewingShot] = useState<Screenshot | null>(null)
  const [rerunning, setRerunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const report = await api.report(id)
      setData(report)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this report.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const isActive = data ? ['queued', 'running', 'pending'].includes(data.execution.status) : false

  useEffect(() => {
    if (!isActive) return
    const timer = window.setInterval(() => void load(), 1600)
    return () => window.clearInterval(timer)
  }, [isActive, load])

  const results = useMemo(() => data?.results ?? [], [data])

  const filtered = useMemo(() => {
    return results.filter((result) => {
      const wanted = tab === 'all' ? null : tab === 'warnings' ? 'warning' : tab
      if (wanted && result.status !== (wanted as ResultStatus)) return false
      if (severity !== 'all' && result.severity !== severity) return false
      return true
    })
  }, [results, tab, severity])

  const rerun = async () => {
    setRerunning(true)
    try {
      const execution = await api.rerun(id)
      toast.push('info', 'Re-run queued', 'A new execution was created; this report is unchanged.')
      navigate(`/reports/${execution.id}`)
    } catch (err) {
      toast.push('error', 'Could not re-run', err instanceof ApiError ? err.message : 'Unknown error')
    } finally {
      setRerunning(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm text-rose-800">
          <AlertTriangle className="size-4" /> {error}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} icon={<RefreshCw className="size-3.5" />}>
            Retry
          </Button>
          <Link to="/history">
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-3.5" />}>
              Back to history
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  if (!data) return null

  const { execution, analysis, health } = data
  const tone = scoreTone(execution.health_score)
  const counts = execution.counts
  const isAi = analysis.mode === 'ai'
  const shotOf = (shot: Screenshot) =>
    data.results.find((result) => result.id === shot.test_result_id)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/history"
          className="focus-ring inline-flex items-center gap-1.5 text-[11px] text-[#6b665c] hover:text-[#26231f]"
        >
          <ArrowLeft className="size-3.5" /> Back to history
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={rerunning}
            onClick={() => void rerun()}
            icon={<RefreshCw className="size-3.5" />}
          >
            Re-run
          </Button>
          <a href={api.exportJsonUrl(id)} download className="focus-ring">
            <Button variant="secondary" size="sm" icon={<FileJson className="size-3.5" />}>
              JSON
            </Button>
          </a>
          <a href={api.exportHtmlUrl(id)} download className="focus-ring">
            <Button variant="secondary" size="sm" icon={<Download className="size-3.5" />}>
              HTML
            </Button>
          </a>
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-[#171512]">
                {execution.name || execution.page_title || shortUrl(execution.url)}
              </h1>
              <StatusBadge status={execution.status} />
              {isActive ? (
                <span className="flex items-center gap-1 text-[11px] text-indigo-700">
                  <Loader2 className="size-3 animate-spin" /> live
                </span>
              ) : null}
            </div>
            <a
              href={execution.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 break-all text-xs text-[#6b665c] hover:text-indigo-800"
            >
              {execution.url} <ExternalLink className="size-3" />
            </a>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6b665c]">
              <span>
                Execution <span className="font-mono text-[#6b665c]">{execution.id}</span>
              </span>
              <span>Started {formatDateTime(execution.started_at ?? execution.created_at)}</span>
              <span>Duration {formatDuration(execution.duration_ms)}</span>
              {execution.page_title ? <span>Title “{execution.page_title}”</span> : null}
            </div>
            {execution.error_message ? (
              <p className="mt-2 rounded-lg border border-rose-600/20 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-800">
                {execution.error_message}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] px-3 py-2">
            <div className="text-right">
              <p className="text-[10px] text-[#6b665c]">Health score</p>
              <p className={cn('text-xl font-semibold', tone.text)}>
                {execution.health_score ?? '—'}
                <span className="text-[11px] text-[#756f62]">/100</span>
              </p>
              <p className={cn('text-[10px]', tone.text)}>{tone.label}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Passed', counts.passed, 'text-emerald-700'],
          ['Failed', counts.failed, 'text-rose-700'],
          ['Warnings', counts.warnings, 'text-amber-700'],
          ['Skipped', counts.skipped, 'text-[#6b665c]'],
        ].map(([label, value, color]) => (
          <Card key={String(label)} className="p-3.5">
            <p className="text-[10px] text-[#6b665c]">{label}</p>
            <p className={cn('mt-1 text-xl font-semibold', color as string)}>{value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[#e5dfd1] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {TABS.map((item) => {
              const amount =
                item.key === 'all'
                  ? counts.total
                  : item.key === 'warnings'
                    ? counts.warnings
                    : counts[item.key as 'passed' | 'failed' | 'skipped']
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={cn(
                    'focus-ring rounded-lg px-2.5 py-1.5 text-[11px] transition-colors',
                    tab === item.key
                      ? 'bg-indigo-500/15 text-indigo-800 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.3)]'
                      : 'text-[#6b665c] hover:bg-white/5 hover:text-[#26231f]',
                  )}
                >
                  {item.label} <span className="text-[#6b665c]">{amount}</span>
                </button>
              )
            })}
          </div>
          <div className="w-44 shrink-0">
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className="text-xs"
              aria-label="Filter by severity"
            >
              {SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'All severities' : value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="size-5" />}
            title="No checks match this filter"
            description="Adjust the status or severity filter to see the recorded checks."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="text-[10px] text-[#6b665c]">
                <tr className="border-b border-[#e5dfd1]">
                  <th className="px-4 py-2.5 font-medium">Test</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Severity</th>
                  <th className="px-3 py-2.5 font-medium">Duration</th>
                  <th className="px-4 py-2.5 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((result) => (
                  <tr key={result.id} className="border-b border-[#f4f1e9] last:border-0 hover:bg-[#1b1916]/[0.02]">
                    <td className="max-w-[280px] px-4 py-2.5">
                      <p className="truncate font-medium text-[#26231f]">{result.test_name}</p>
                      <p className="truncate text-[11px] text-[#6b665c]">{result.description}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[#6b665c]">{result.category}</td>
                    <td className="px-3 py-2.5">
                      <ResultBadge status={result.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge severity={result.severity} />
                    </td>
                    <td className="px-3 py-2.5 text-[#6b665c]">{formatDuration(result.duration_ms)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDetail(result)}
                        className="focus-ring inline-flex items-center gap-1 rounded-md border border-[#d6cdbb] px-2 py-1 text-[11px] text-[#3f3a33] hover:border-indigo-600/40 hover:text-indigo-800"
                      >
                        Open <ChevronDown className="size-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-indigo-700" />
          <h2 className="text-sm font-semibold text-[#171512]">Analysis</h2>
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
              isAi
                ? 'border-violet-600/30 bg-violet-500/10 text-violet-800'
                : 'border-[#d6cdbb] bg-[#f7f4ed] text-[#6b665c]',
            )}
          >
            {isAi ? <Sparkles className="size-3" /> : <Bot className="size-3" />}
            {isAi
              ? `AI analysis · ${analysis.provider}${analysis.model ? ` (${analysis.model})` : ''}`
              : 'Rule-based analysis'}
          </span>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-[#6b665c]">
          Facts below come only from the executed checks stored for this run. Suggested fixes and
          recommendations are{' '}
          {isAi ? 'AI-generated guidance' : 'generated by local rules'}
          {isAi ? ', not verified findings' : ''}.
        </p>

        {analysis.error ? (
          <p className="mt-2 rounded-lg border border-amber-600/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-800">
            {analysis.error}
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] p-3.5">
              <p className="text-[10px] text-[#6b665c]">Executive summary</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#3f3a33]">
                {analysis.executive_summary || 'No summary was produced for this run.'}
              </p>
            </div>
            {analysis.developer_explanations.length > 0 ? (
              <div className="rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] p-3.5">
                <p className="text-[10px] text-[#6b665c]">
                  Developer explanations
                </p>
                <ul className="mt-2 space-y-2">
                  {analysis.developer_explanations.map((item) => (
                    <li key={item.issue} className="text-xs leading-relaxed">
                      <span className="font-medium text-[#26231f]">{item.issue}: </span>
                      <span className="text-[#6b665c]">{item.explanation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] p-3.5">
              <p className="flex items-center gap-1.5 text-[10px] text-[#6b665c]">
                <AlertTriangle className="size-3" /> Risk assessment
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[#3f3a33]">
                {analysis.risk_assessment || 'No risk assessment available.'}
              </p>
            </div>
            <div className="rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] p-3.5">
              <p className="flex items-center gap-1.5 text-[10px] text-[#6b665c]">
                <Lightbulb className="size-3" /> Recommendations
              </p>
              <ul className="mt-2 space-y-1.5">
                {analysis.recommendations.length ? (
                  analysis.recommendations.map((item) => (
                    <li key={item} className="flex gap-1.5 text-xs leading-relaxed text-[#6b665c]">
                      <span className="mt-1 size-1 shrink-0 rounded-full bg-indigo-600" />
                      {item}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-[#6b665c]">No recommendations returned.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#171512]">Findings</h2>
          <span className="text-[11px] text-[#6b665c]">
            {analysis.findings.length} issue{analysis.findings.length === 1 ? '' : 's'}
          </span>
        </div>
        {analysis.findings.length === 0 ? (
          <p className="rounded-lg border border-[#ddd6c8] bg-[#fdfcf8] p-3 text-xs text-[#6b665c]">
            No issues were detected by the checks that actually ran.
          </p>
        ) : (
          <div className="space-y-2">
            {analysis.findings.map((finding, index) => (
              <div
                key={`${finding.title}-${index}`}
                className="rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <p className="text-xs font-medium text-[#26231f]">{finding.title}</p>
                  <span className="rounded bg-[#e5dfd1] px-1.5 py-0.5 text-[10px] text-[#6b665c]">
                    {finding.category}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#6b665c]">
                  {finding.description}
                </p>
                {finding.evidence ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded-lg border border-[#e5dfd1] bg-[#fbf9f4] p-2 text-[10px] leading-relaxed text-[#6b665c]">
                    {finding.evidence}
                  </pre>
                ) : null}
                <p className="mt-2 text-[11px] text-indigo-800/90">
                  <span className="text-[#6b665c]">
                    {isAi ? 'AI-suggested fix: ' : 'Suggested fix: '}
                  </span>
                  {finding.suggested_fix}
                </p>
                {finding.url ? (
                  <p className="mt-1 break-all font-mono text-[10px] text-[#756f62]">{finding.url}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#171512]">Screenshots</h2>
          <span className="text-[11px] text-[#6b665c]">{data.screenshots.length} stored</span>
        </div>
        {data.screenshots.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="size-5" />}
            title="No screenshots for this run"
            description="Screenshot capture was disabled, or the page could not be rendered."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.screenshots.map((shot) => {
              const linked = shotOf(shot)
              return (
                <button
                  key={shot.id}
                  type="button"
                  onClick={() => setViewingShot(shot)}
                  className="focus-ring group overflow-hidden rounded-xl border border-[#ddd6c8] bg-[#fdfcf8] text-left"
                >
                  <img
                    src={shot.view_url}
                    alt={`${shot.screenshot_type} screenshot of ${execution.url}`}
                    className="aspect-[16/10] w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                    <span className="text-[10px] text-[#6b665c]">
                      {shot.screenshot_type.replace('_', ' ')}
                    </span>
                    <span className="truncate text-[10px] text-[#756f62]">
                      {linked ? linked.test_name : 'Page capture'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-4 text-[11px] leading-relaxed text-[#6b665c]">
        <p className="font-medium text-[#3f3a33]">How this health score was computed</p>
        <p className="mt-1">{health.explanation}</p>
      </Card>

      <Modal open={Boolean(detail)} title={detail?.test_name ?? 'Check details'} onClose={() => setDetail(null)} wide>
        {detail ? (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <ResultBadge status={detail.status} />
              <SeverityBadge severity={detail.severity} />
              <span className="rounded bg-[#e5dfd1] px-1.5 py-0.5 text-[10px] text-[#6b665c]">
                {detail.category}
              </span>
              <span className="text-[10px] text-[#6b665c]">{formatDuration(detail.duration_ms)}</span>
            </div>
            <div>
              <p className="text-[10px] text-[#6b665c]">Description</p>
              <p className="mt-1 leading-relaxed text-[#3f3a33]">{detail.description}</p>
            </div>
            {detail.error_details ? (
              <div>
                <p className="text-[10px] text-[#6b665c]">Evidence</p>
                <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-[#e5dfd1] bg-[#fbf9f4] p-2.5 text-[10px] leading-relaxed text-[#6b665c]">
                  {detail.error_details}
                </pre>
              </div>
            ) : null}
            {detail.url ? (
              <p className="break-all text-[10px] text-[#6b665c]">
                Target: <span className="font-mono text-[#6b665c]">{detail.url}</span>
              </p>
            ) : null}
            {detail.screenshot_ids.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.screenshots
                  .filter((shot) => detail.screenshot_ids.includes(shot.id))
                  .map((shot) => (
                    <button
                      key={shot.id}
                      type="button"
                      onClick={() => {
                        setDetail(null)
                        setViewingShot(shot)
                      }}
                      className="focus-ring overflow-hidden rounded-lg border border-[#d6cdbb]"
                    >
                      <img src={shot.view_url} alt="Related screenshot" className="h-20 w-32 object-cover object-top" />
                    </button>
                  ))}
              </div>
            ) : null}
            <p className="text-[10px] text-[#756f62]">
              Recorded {formatDateTime(detail.finished_at ?? detail.created_at)}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(viewingShot)} title={viewingShot ? `${viewingShot.screenshot_type} screenshot` : 'Screenshot'} onClose={() => setViewingShot(null)} wide>
        {viewingShot ? (
          <div className="space-y-2">
            <img
              src={viewingShot.view_url}
              alt={`Full ${viewingShot.screenshot_type} screenshot`}
              className="max-h-[65vh] w-full rounded-lg border border-[#ddd6c8] object-contain"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6b665c]">
              <span className="break-all">{viewingShot.page_url ?? execution.url}</span>
              <a
                href={viewingShot.download_url}
                download
                className="focus-ring inline-flex items-center gap-1 text-indigo-800 hover:text-indigo-100"
              >
                <Download className="size-3.5" /> Download PNG
              </a>
            </div>
            {shotOf(viewingShot) ? (
              <p className="text-[11px] text-[#6b665c]">
                Associated check: <span className="text-[#26231f]">{shotOf(viewingShot)?.test_name}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
