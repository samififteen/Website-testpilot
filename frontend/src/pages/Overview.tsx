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

const BAR_COLOURS = { passed: '#14805c', warnings: '#8a6100', failed: '#b3263c' }

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
          className={cn('serif-title tabular text-[32px]', tone ?? 'text-[#171512]')}
        />
      </p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-[#756f62]">{hint}</p>
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
    <div className="bg-[#fdfcf8] px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] text-[#756f62]">
        {icon}
        {label}
      </dt>
      <dd className={cn('mt-1 tabular text-[15px] font-medium capitalize', tone ?? 'text-[#1b1916]')}>
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
        title="Overview"
        description="Latest health score, activity over two weeks, and the runs behind it."
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
        <Card className="mb-4 border-[#b3263c]/25 bg-[#b3263c]/[0.04] p-4">
          <div className="flex items-center gap-2 text-[12.5px] text-[#a8233a]">
            <AlertTriangle className="size-4" />
            {error}
          </div>
          <p className="mt-1.5 text-[11px] text-[#726c62]">
            Start the backend with{' '}
            <code className="rounded bg-[#e5dfd1] px-1 py-0.5 text-[#4a453d]">
              uvicorn app.main:app --port 8000
            </code>
            .
          </p>
        </Card>
      ) : null}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,370px)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-4 pt-4">
            <div>
              <h2 className="text-[13px] font-medium text-[#1b1916]">Website health</h2>
              <p className="mono-label mt-1.5">Latest completed run</p>
            </div>
          </div>

          {loading && !data ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-16" />
            </div>
          ) : health?.has_data ? (
            <div className="px-4 pb-4">
              <div className="mt-4 flex items-center gap-5">
                <ScoreGauge score={health.health_score} width={186} />
                <div className="min-w-0 space-y-1.5">
                  <p className={cn('text-[13px] font-medium', tone.text)}>{tone.label}</p>
                  <p className="text-[11px] leading-relaxed text-[#726c62]">
                    Weighted deduction from the checks that actually ran. Higher is better.
                  </p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-[#ddd6c8] bg-[#ddd6c8]">
                <HealthFact
                  icon={<Link2Off className="size-3" />}
                  label="Broken links"
                  value={health.broken_links}
                  tone={health.broken_links > 0 ? 'text-[#a8233a]' : undefined}
                />
                <HealthFact
                  icon={<Terminal className="size-3" />}
                  label="JS errors"
                  value={health.javascript_errors}
                  tone={health.javascript_errors > 0 ? 'text-[#a8233a]' : undefined}
                />
                <HealthFact
                  icon={<AlertTriangle className="size-3" />}
                  label="Failed requests"
                  value={health.failed_requests}
                  tone={health.failed_requests > 0 ? 'text-[#8a6100]' : undefined}
                />
                <HealthFact
                  icon={<ShieldCheck className="size-3" />}
                  label="Forms"
                  value={health.form_validation_status}
                />
              </dl>

              <p className="mt-3 text-[11px] leading-relaxed text-[#756f62]">{health.explanation}</p>
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
              <div className="grid grid-cols-2 divide-x divide-[#e5dfd1] sm:grid-cols-4">
                <Metric
                  label="Total tests"
                  value={stats.total_tests}
                  hint={stats.running_tests ? `${stats.running_tests} in progress` : 'All executions'}
                />
                <Metric
                  label="Successful"
                  value={stats.passed_tests}
                  hint="Passed every check"
                  tone="text-[#14805c]"
                />
                <Metric
                  label="Failed"
                  value={stats.failed_tests}
                  hint="Critical / high"
                  tone="text-[#a8233a]"
                />
                <Metric
                  label="Success rate"
                  value={stats.success_rate}
                  suffix="%"
                  decimals={rateDecimals}
                  hint="Passed ÷ completed"
                  tone="text-[#3f3a33]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#e5dfd1] px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] text-[#726c62]">
                  <Timer className="size-3.5 text-[#756f62]" />
                  Average duration
                  <span className="tabular font-mono text-[11.5px] text-[#2e2a25]">
                    {formatDuration(stats.average_duration_ms)}
                  </span>
                </p>
                <p className="flex items-center gap-2 text-[11px] text-[#726c62]">
                  <Gauge className="size-3.5 text-[#756f62]" />
                  Avg health
                  <span className="tabular font-mono text-[11.5px] text-[#2e2a25]">
                    {stats.average_health_score ?? '—'}
                  </span>
                </p>
                <p className="ml-auto text-[10.5px] text-[#756f62]">
                  {stats.last_run_at ? `Last run ${relativeTime(stats.last_run_at)}` : 'No runs recorded'}
                </p>
              </div>

              <div className="flex items-center gap-4 border-t border-[#e5dfd1] px-4 py-2.5">
                {[
                  { label: 'Passed', value: stats.passed_tests, className: 'text-[#14805c]' },
                  { label: 'Failed', value: stats.failed_tests, className: 'text-[#a8233a]' },
                  { label: 'Warnings', value: stats.warning_tests, className: 'text-[#8a6100]' },
                ].map((item) => (
                  <div key={item.label} className="flex items-baseline gap-1.5">
                    <span className={cn('tabular text-[13px] font-medium', item.className)}>
                      {item.value}
                    </span>
                    <span className="text-[10.5px] text-[#756f62]">{item.label}</span>
                  </div>
                ))}
                <Link
                  to="/history"
                  className="focus-ring ml-auto flex items-center gap-1 text-[11px] text-[#726c62] underline decoration-[#c3b9a6] underline-offset-2 hover:text-[#1b1916]"
                >
                  History <ArrowUpRight className="size-3" />
                </Link>
              </div>
            </>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5dfd1] px-4 py-3">
          <div className="flex items-center gap-2">
            <Activity className="size-3.5 text-[#2b4b7e]" />
            <h2 className="text-[12.5px] font-medium text-[#1b1916]">Test activity</h2>
            <span className="text-[11px] text-[#756f62]">last 14 days</span>
          </div>
          <div className="flex items-center gap-3 text-[10.5px] capitalize text-[#726c62]">
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
          <div className="h-[214px] w-full px-2 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activity} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#e5dfd1" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#756f62', fontSize: 10, fontFamily: 'Geist Mono' }}
                  tickFormatter={(value: string) => value.slice(5)}
                  axisLine={{ stroke: '#ddd6c8' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: '#756f62', fontSize: 10, fontFamily: 'Geist Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(27,25,22,0.04)' }}
                  contentStyle={{
                    background: '#fdfcf8',
                    border: '1px solid #ddd6c8',
                    borderRadius: 4,
                    fontSize: 11,
                    boxShadow: '0 12px 28px -16px rgba(27,25,22,0.35)',
                  }}
                  labelStyle={{ color: '#4a453d', fontFamily: 'Geist Mono', fontSize: 10 }}
                  itemStyle={{ padding: 0 }}
                />
                <Bar dataKey="passed" name="Passed" stackId="a" fill={BAR_COLOURS.passed} barSize={22} />
                <Bar dataKey="warnings" name="Warnings" stackId="a" fill={BAR_COLOURS.warnings} barSize={22} />
                <Bar
                  dataKey="failed"
                  name="Failed"
                  stackId="a"
                  fill={BAR_COLOURS.failed}
                  barSize={22}
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
        <div className="flex items-center justify-between border-b border-[#e5dfd1] px-4 py-3">
          <div className="flex items-center gap-2">
            <FileBarChart className="size-3.5 text-[#2b4b7e]" />
            <h2 className="text-[12.5px] font-medium text-[#1b1916]">Recent test runs</h2>
          </div>
          <Link
            to="/history"
            className="focus-ring flex items-center gap-1 font-mono text-[10px] text-[#726c62] hover:text-[#2e2a25]"
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
                <tr className="border-b border-[#e5dfd1]">
                  {['Website', 'Status', 'Checks', 'Duration', 'Run at', ''].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-2 font-mono text-[9.5px] font-normal text-[#756f62]"
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
                    className="group border-b border-[#f4f1e9] transition-colors last:border-0 hover:bg-[#1b1916]/[0.018]"
                  >
                    <td className="px-4 py-2.5">
                      <Link to={`/reports/${run.id}`} className="block max-w-[340px]">
                        <span className="block truncate font-medium text-[#26231f] group-hover:text-white">
                          {run.page_title || shortUrl(run.url)}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-[#756f62]">
                          {run.url}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="tabular font-mono text-[10.5px]">
                        <span className="text-[#14805c]">{run.counts.passed}</span>
                        <span className="px-1 text-[#b7ad9a]">/</span>
                        <span className="text-[#a8233a]">{run.counts.failed}</span>
                        <span className="px-1 text-[#b7ad9a]">/</span>
                        <span className="text-[#8a6100]">{run.counts.warnings}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular font-mono text-[10.5px] text-[#6b665c]">
                      {formatDuration(run.duration_ms)}
                    </td>
                    <td className="px-4 py-2.5 text-[10.5px] text-[#6b665c]">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to={`/reports/${run.id}`}
                        className="focus-ring inline-flex size-6 items-center justify-center rounded-md border border-transparent text-[#756f62] transition-colors group-hover:border-[#c3b9a6] group-hover:text-[#2e2a25]"
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
        <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-[#756f62]">
          <XCircle className="size-3 text-[#a8233a]" />
          Failing runs never overwrite history — re-run a test to produce a fresh execution.
          <CheckCircle2 className="ml-2 size-3 text-[#14805c]" />
          Scores update only from real checks.
        </p>
      ) : null}
    </div>
  )
}
