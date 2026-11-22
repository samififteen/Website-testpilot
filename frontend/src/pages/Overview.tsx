import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileBarChart,
  Gauge,
  Link2Off,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Timer,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, ApiError } from '../api'
import { PageHeader } from '../layouts/Layout'
import type { DashboardData } from '../types'
import { formatDate, formatDuration, relativeTime, scoreTone, shortUrl } from '../lib/format'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { ScoreGauge } from '../components/ScoreGauge'
import { Button, Card, EmptyState, Skeleton, StatusBadge, cn } from '../components/ui'

const BAR_COLOURS = { passed: '#3ddc97', warnings: '#f5c451', failed: '#fb7185' }

function Metric({
  label,
  value,
  suffix,
  hint,
  tone,
  decimals = 0,
}: {
  label: string
  value: number
  suffix?: string
  hint: string
  tone?: string
  decimals?: number
}) {
  return (
    <div className="min-w-0 px-4 py-4">
      <p className="mono-label">{label}</p>
      <p className="mt-2 flex items-baseline gap-0.5">
        <AnimatedNumber
          value={value}
          decimals={decimals}
          suffix={suffix}
          className={cn('tabular text-[26px] font-medium leading-none tracking-[-0.03em]', tone ?? 'text-[#f0f1f6]')}
        />
      </p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-[#626b7a]">{hint}</p>
    </div>
  )
}

function HealthFact({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string | number
  tone?: string
}) {
  return (
    <div className="bg-[#0a0c11] px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-[#626b7a]">
        {icon}
        {label}
      </dt>
      <dd className={cn('mt-1 tabular text-[15px] font-medium capitalize', tone ?? 'text-[#e2e5ee]')}>
        {value}
      </dd>
    </div>
  )
}

export function Overview() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.dashboard(14))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the TestPilot API.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = data?.stats
  const health = data?.health
  const tone = scoreTone(health?.health_score)
  const rateDecimals = stats && Number.isInteger(stats.success_rate) ? 0 : 1

  return (
    <div>
      <PageHeader
        eyebrow="Control room"
        title="Overview"
        description="Every number below is computed from stored test executions — no placeholders, no simulated runs."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              icon={<RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />}
            >
              Refresh
            </Button>
            <Link to="/new">
              <Button size="sm" icon={<Play className="size-3.5" />}>
                Run a test
              </Button>
            </Link>
          </>
        }
      />

      {error ? (
        <Card className="mb-4 border-[#fb7185]/25 bg-[#fb7185]/[0.04] p-4">
          <div className="flex items-center gap-2 text-[12.5px] text-[#fda4af]">
            <AlertTriangle className="size-4" />
            {error}
          </div>
          <p className="mt-1.5 text-[11px] text-[#7d8595]">
            Start the backend with{' '}
            <code className="rounded bg-[#14171e] px-1 py-0.5 text-[#b7becb]">
              uvicorn app.main:app --port 8000
            </code>
            .
          </p>
        </Card>
      ) : null}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,370px)_minmax(0,1fr)]">
        <Card spotlight className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 pt-4">
            <div>
              <h2 className="text-[13px] font-medium text-[#e2e5ee]">Website health</h2>
              <p className="mono-label mt-1.5">Latest completed run</p>
            </div>
            {health?.has_data ? <StatusBadge status="passed" /> : null}
          </div>

          {loading && !data ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-16" />
            </div>
          ) : health?.has_data ? (
            <div className="px-4 pb-4">
              <div className="mt-4 flex items-center gap-5">
                <ScoreGauge score={health.health_score} size={162} />
                <div className="min-w-0 space-y-1.5">
                  <p className={cn('text-[13px] font-medium', tone.text)}>{tone.label}</p>
                  <p className="text-[11px] leading-relaxed text-[#7d8595]">
                    Weighted deduction from the checks that actually ran. Higher is better.
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[#1b1e27] bg-[#1b1e27]">
                <HealthFact
                  icon={<Link2Off className="size-3" />}
                  label="Broken links"
                  value={health.broken_links}
                  tone={health.broken_links > 0 ? 'text-[#fda4af]' : undefined}
                />
                <HealthFact
                  icon={<Terminal className="size-3" />}
                  label="JS errors"
                  value={health.javascript_errors}
                  tone={health.javascript_errors > 0 ? 'text-[#fda4af]' : undefined}
                />
                <HealthFact
                  icon={<AlertTriangle className="size-3" />}
                  label="Failed requests"
                  value={health.failed_requests}
                  tone={health.failed_requests > 0 ? 'text-[#f5c451]' : undefined}
                />
                <HealthFact
                  icon={<ShieldCheck className="size-3" />}
                  label="Forms"
                  value={health.form_validation_status}
                />
              </dl>

              <p className="mt-3 text-[10px] leading-relaxed text-[#5f6776]">{health.explanation}</p>
            </div>
          ) : (
            <EmptyState
              icon={<Timer className="size-4" />}
              title="No health data"
              description="A score appears after a completed run. Health is calculated from broken links, console errors, failed requests and form checks."
              action={
                <Link to="/new">
                  <Button size="sm" icon={<Play className="size-3.5" />}>
                    Run your first test
                  </Button>
                </Link>
              }
            />
          )}
        </Card>

        <div className="min-w-0 space-y-3">
        <Card className="overflow-hidden">
          {loading && !stats ? (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20" />
              ))}
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 divide-x divide-[#14171e] sm:grid-cols-4">
                <Metric
                  label="Total tests"
                  value={stats.total_tests}
                  hint={stats.running_tests ? `${stats.running_tests} in progress` : 'All executions'}
                />
                <Metric
                  label="Successful"
                  value={stats.passed_tests}
                  hint="Passed every check"
                  tone="text-[#5fe3ad]"
                />
                <Metric
                  label="Failed"
                  value={stats.failed_tests}
                  hint="Critical / high"
                  tone="text-[#fda4af]"
                />
                <Metric
                  label="Success rate"
                  value={stats.success_rate}
                  suffix="%"
                  decimals={rateDecimals}
                  hint="Passed ÷ completed"
                  tone="text-[#c3c9d6]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#14171e] px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] text-[#7d8595]">
                  <Timer className="size-3.5 text-[#5f6776]" />
                  Average duration
                  <span className="tabular font-mono text-[11.5px] text-[#d6dae4]">
                    {formatDuration(stats.average_duration_ms)}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-[11px] text-[#7d8595]">
                  <Gauge className="size-3.5 text-[#5f6776]" />
                  Avg health
                  <span className="tabular font-mono text-[11.5px] text-[#d6dae4]">
                    {stats.average_health_score ?? '—'}
                  </span>
                </p>
                <p className="ml-auto text-[10.5px] text-[#626b7a]">
                  {stats.last_run_at ? `Last run ${relativeTime(stats.last_run_at)}` : 'No runs recorded'}
                </p>
              </div>

              <div className="flex items-center gap-4 border-t border-[#14171e] px-4 py-2.5">
                {[
                  { label: 'Passed', value: stats.passed_tests, className: 'text-[#5fe3ad]' },
                  { label: 'Failed', value: stats.failed_tests, className: 'text-[#fda4af]' },
                  { label: 'Warnings', value: stats.warning_tests, className: 'text-[#f4cd72]' },
                ].map((item) => (
                  <div key={item.label} className="flex items-baseline gap-1.5">
                    <span className={cn('tabular text-[13px] font-medium', item.className)}>
                      {item.value}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#5f6776]">
                      {item.label}
                    </span>
                  </div>
                ))}
                <Link
                  to="/history"
                  className="focus-ring ml-auto flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-[#7d8595] hover:text-[#d6dae4]"
                >
                  History <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#14171e] px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 text-[#7c86ff]" />
            <h2 className="text-[12.5px] font-medium text-[#e2e5ee]">Test activity</h2>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#5f6776]">
              14 days
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[9.5px] uppercase tracking-[0.06em] text-[#7d8595]">
            {Object.entries(BAR_COLOURS).map(([label, colour]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-[1px]" style={{ background: colour }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {loading && !data ? (
          <div className="p-4">
            <Skeleton className="h-52" />
          </div>
        ) : data && data.activity.some((point) => point.total > 0) ? (
          <div className="h-[248px] w-full px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activity} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#14171e" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#5f6776', fontSize: 10, fontFamily: 'Geist Mono' }}
                  tickFormatter={(value: string) => value.slice(5)}
                  axisLine={{ stroke: '#1b1e27' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#5f6776', fontSize: 10, fontFamily: 'Geist Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    background: '#0b0d12',
                    border: '1px solid #2a2f3d',
                    borderRadius: 8,
                    fontSize: 11,
                    boxShadow: '0 20px 50px -20px rgba(0,0,0,0.9)',
                  }}
                  labelStyle={{ color: '#b7becb', fontFamily: 'Geist Mono', fontSize: 10 }}
                  itemStyle={{ padding: 0 }}
                />
                <Bar dataKey="passed" name="Passed" stackId="a" fill={BAR_COLOURS.passed} barSize={18} />
                <Bar dataKey="warnings" name="Warnings" stackId="a" fill={BAR_COLOURS.warnings} barSize={18} />
                <Bar
                  dataKey="failed"
                  name="Failed"
                  stackId="a"
                  fill={BAR_COLOURS.failed}
                  barSize={18}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={<Activity className="size-4" />}
            title="No activity yet"
            description="Run your first test and this chart plots real pass/fail trends from the database."
            action={
              <Link to="/new">
                <Button size="sm" icon={<Play className="size-3.5" />}>
                  Start a test
                </Button>
              </Link>
            }
          />
        )}
        </Card>
        </div>
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#14171e] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileBarChart className="size-3.5 text-[#7c86ff]" />
            <h2 className="text-[12.5px] font-medium text-[#e2e5ee]">Recent test runs</h2>
          </div>
          <Link
            to="/history"
            className="focus-ring flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-[#7d8595] hover:text-[#d6dae4]"
          >
            All runs <ArrowUpRight className="size-3" />
          </Link>
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : data && data.recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#14171e]">
                  {['Website', 'Status', 'Checks', 'Duration', 'Run at', ''].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-2 font-mono text-[9.5px] font-normal uppercase tracking-[0.1em] text-[#5f6776]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent.map((run) => (
                  <tr
                    key={run.id}
                    className="group border-b border-[#11141b] transition-colors last:border-0 hover:bg-white/[0.018]"
                  >
                    <td className="px-4 py-2.5">
                      <Link to={`/reports/${run.id}`} className="block max-w-[340px]">
                        <span className="block truncate font-medium text-[#dcdfe8] group-hover:text-white">
                          {run.page_title || shortUrl(run.url)}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-[#5f6776]">
                          {run.url}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="tabular font-mono text-[10.5px]">
                        <span className="text-[#5fe3ad]">{run.counts.passed}</span>
                        <span className="px-1 text-[#333a48]">/</span>
                        <span className="text-[#fda4af]">{run.counts.failed}</span>
                        <span className="px-1 text-[#333a48]">/</span>
                        <span className="text-[#f4cd72]">{run.counts.warnings}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular font-mono text-[10.5px] text-[#8b93a3]">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-4 py-2.5 text-[10.5px] text-[#6b7280]">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to={`/reports/${run.id}`}
                        className="focus-ring inline-flex size-6 items-center justify-center rounded-md border border-transparent text-[#5f6776] transition-colors group-hover:border-[#2a2f3d] group-hover:text-[#d6dae4]"
                        aria-label={`Open report for ${run.url}`}
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<FileBarChart className="size-4" />}
            title="No test runs yet"
            description="TestPilot opens a real headless Chromium browser, checks the site and stores every result. Start with a site you own."
            action={
              <Link to="/new">
                <Button size="sm" icon={<Play className="size-3.5" />}>
                  Create your first test
                </Button>
              </Link>
            }
          />
        )}
      </Card>

      {(stats?.warning_tests ?? 0) > 0 || (stats?.failed_tests ?? 0) > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-[#5f6776]">
          <XCircle className="size-3 text-[#fda4af]" />
          Failing runs never overwrite history — re-run a test to produce a fresh execution.
          <CheckCircle2 className="ml-2 size-3 text-[#5fe3ad]" />
          Scores update only from real checks.
        </p>
      ) : null}
    </div>
  )
}
