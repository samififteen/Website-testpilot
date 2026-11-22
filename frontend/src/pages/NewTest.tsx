import {
  ArrowUpRight,
  Ban,
  CheckCircle2,
  CircleDot,
  FileBarChart,
  Link2,
  Loader2,
  Play,
  ScanLine,
  ShieldAlert,
  Square,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, subscribeToExecution } from '../api'
import { useToast } from '../components/Toast'
import {
  Button,
  Card,
  Field,
  Input,
  ResultBadge,
  Select,
  SeverityBadge,
  StatusBadge,
  Toggle,
  cn,
} from '../components/ui'
import { PageHeader } from '../layouts/Layout'
import type { StreamSnapshot, TestConfig } from '../types'
import { formatDuration } from '../lib/format'

const DEFAULT_CONFIG: TestConfig = {
  browser: 'chromium',
  max_depth: 1,
  max_pages: 5,
  max_links: 25,
  timeout_seconds: 60,
  check_links: true,
  test_interactions: true,
  test_forms: true,
  capture_screenshots: true,
  ai_analysis: true,
}

const TERMINAL = new Set(['passed', 'failed', 'warnings', 'cancelled', 'error'])

export function validateTargetUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter the website URL you want to test.'
  let parsed: URL
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return 'That is not a valid URL. Include a hostname, e.g. https://example.com.'
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Only HTTP and HTTPS URLs can be tested.'
  }
  const host = parsed.hostname.toLowerCase()
  const isDevHost = ['localhost', '127.0.0.1', '::1'].includes(
    typeof window === 'undefined' ? '' : window.location.hostname,
  )
  const localHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]', '169.254.169.254']
  if (localHosts.includes(host) || host.endsWith('.localhost')) {
    if (!isDevHost) return 'Local and private network targets are blocked.'
    return null
  }
  if (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.endsWith('.internal')
  ) {
    return 'Private, link-local and internal hosts are blocked by the SSRF policy.'
  }
  return null
}

function LivePanel({
  executionId,
  url,
  snapshot,
  streamError,
  cancelling,
  onCancel,
}: {
  executionId: string
  url: string
  snapshot: StreamSnapshot | null
  streamError: boolean
  cancelling: boolean
  onCancel: () => void
}) {
  const done = snapshot ? TERMINAL.has(snapshot.status) : false
  const current = snapshot?.progress?.current ?? 0
  const total = snapshot?.progress?.total ?? 8
  const percent = done ? 100 : Math.min(100, Math.round((current / total) * 100))

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-[#6b665c]">Live execution</p>
          <p className="mt-1 truncate text-sm font-medium text-[#171512]">{url}</p>
          <p className="mt-0.5 font-mono text-[10px] text-[#756f62]">{executionId}</p>
        </div>
        {snapshot ? <StatusBadge status={snapshot.status} /> : <StatusBadge status="queued" />}
      </div>

      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-[#e5dfd1]">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              snapshot?.status === 'failed'
                ? 'bg-rose-600'
                : snapshot?.status === 'warnings'
                  ? 'bg-amber-600'
                  : 'bg-indigo-600',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[#6b665c]">
          <span className="flex items-center gap-1.5">
            {done ? (
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            ) : (
              <Loader2 className="size-3.5 animate-spin text-indigo-700" />
            )}
            {snapshot?.progress?.message ?? 'Waiting for the worker…'}
          </span>
          <span>{percent}%</span>
        </div>
      </div>

      {snapshot ? (
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {[
            ['Passed', snapshot.counts.passed, 'text-emerald-700'],
            ['Failed', snapshot.counts.failed, 'text-rose-700'],
            ['Warnings', snapshot.counts.warnings, 'text-amber-700'],
            ['Skipped', snapshot.counts.skipped, 'text-[#6b665c]'],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-lg border border-[#ddd6c8] bg-[#fdfcf8] py-1.5">
              <p className={`text-sm font-medium ${tone}`}>{value}</p>
              <p className="text-[9px] text-[#756f62]">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {streamError ? (
        <p className="mt-3 rounded-lg border border-amber-600/20 bg-amber-500/5 px-2.5 py-1.5 text-[10px] text-amber-800/90">
          Live stream unavailable — falling back to polling. Results are still being saved.
        </p>
      ) : null}

      <div className="mt-3 max-h-64 space-y-1.5 overflow-auto scroll-thin">
        {snapshot?.results.length ? (
          snapshot.results
            .slice()
            .reverse()
            .map((result) => (
              <div
                key={result.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#e5dfd1] bg-[#fdfcf8] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-[#26231f]">{result.test_name}</p>
                  <p className="text-[9px] text-[#756f62]">
                    {result.category} · {formatDuration(result.duration_ms)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <SeverityBadge severity={result.severity} />
                  <ResultBadge status={result.status} />
                </div>
              </div>
            ))
        ) : (
          <p className="rounded-lg border border-dashed border-[#ddd6c8] px-3 py-4 text-center text-[11px] text-[#6b665c]">
            Checks appear here as soon as each one finishes.
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {!done ? (
          <Button
            variant="danger"
            size="sm"
            loading={cancelling}
            onClick={onCancel}
            icon={<Square className="size-3" />}
          >
            Cancel run
          </Button>
        ) : (
          <Link to={`/reports/${executionId}`} className="flex-1">
            <Button size="sm" className="w-full" icon={<FileBarChart className="size-3.5" />}>
              Open full report
            </Button>
          </Link>
        )}
      </div>
    </Card>
  )
}

export function NewTest() {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [config, setConfig] = useState<TestConfig>(DEFAULT_CONFIG)
  const [errors, setErrors] = useState<{ url?: string; authorized?: string }>({})
  const [submitting, setSubmitting] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeUrl, setActiveUrl] = useState('')
  const [snapshot, setSnapshot] = useState<StreamSnapshot | null>(null)
  const [streamError, setStreamError] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)

  // Seed the form with the workspace defaults saved in Settings.
  useEffect(() => {
    api
      .getSettings()
      .then(({ settings }) =>
        setConfig((current) => ({
          ...current,
          browser: settings.default_browser,
          max_depth: settings.default_max_depth,
          max_pages: settings.default_max_pages,
          max_links: settings.default_max_links,
          timeout_seconds: settings.default_timeout_seconds,
          capture_screenshots: settings.capture_screenshots,
          ai_analysis: settings.ai_enabled,
        })),
      )
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!activeId) return
    setStreamError(false)
    const stop = subscribeToExecution(activeId, {
      onUpdate: (update) => setSnapshot(update),
      onDone: (status) => {
        setSnapshot((current) => (current ? { ...current, status: status as StreamSnapshot['status'] } : current))
      },
      onError: () => setStreamError(true),
    })
    stopRef.current = stop
    return () => {
      stop()
      stopRef.current = null
    }
  }, [activeId])

  // Poll as a fallback when EventSource is unavailable or blocked.
  useEffect(() => {
    if (!activeId || !streamError) return
    let alive = true
    const tick = async () => {
      try {
        const detail = await api.getTest(activeId)
        if (!alive) return
        setSnapshot({
          status: detail.status,
          duration_ms: detail.duration_ms,
          health_score: detail.health_score,
          progress: detail.progress ?? null,
          counts: detail.counts,
          results: detail.results,
          terminal: TERMINAL.has(detail.status),
        })
        if (TERMINAL.has(detail.status)) window.clearInterval(timer)
      } catch {
        /* keep polling */
      }
    }
    const timer = window.setInterval(() => void tick(), 2000)
    void tick()
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [activeId, streamError])

  const update = <K extends keyof TestConfig>(key: K, value: TestConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const urlError = validateTargetUrl(url)
    const nextErrors: typeof errors = {}
    if (urlError) nextErrors.url = urlError
    if (!authorized) nextErrors.authorized = 'Confirm you have permission to test this website.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const execution = await api.createTest({
        url: url.trim(),
        name: name.trim() || undefined,
        authorized,
        config,
      })
      setActiveId(execution.id)
      setActiveUrl(execution.url)
      setSnapshot(null)
      toast.push('info', 'Test queued', 'A real Chromium browser is opening the page now.')
      requestAnimationFrame(() => {
        document.getElementById('live-run')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not start the test.'
      toast.push('error', 'Test not started', message)
    } finally {
      setSubmitting(false)
    }
  }

  const cancel = async () => {
    if (!activeId) return
    setCancelling(true)
    try {
      await api.cancel(activeId)
      toast.push('info', 'Cancellation requested', 'The runner stops after the current check.')
    } catch (error) {
      toast.push(
        'error',
        'Could not cancel',
        error instanceof ApiError ? error.message : 'Unknown error',
      )
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Automation"
        title="New website test"
        description="TestPilot opens the site in headless Chromium, checks loading, links, navigation, forms, controls, console errors and network failures, then stores a report."
      />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={submit} noValidate className="space-y-4">
          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[#171512]">Target</h2>
            <p className="mt-0.5 text-[11px] text-[#6b665c]">
              HTTP and HTTPS only. Localhost, private ranges and cloud metadata endpoints are
              rejected by the server as well.
            </p>
            <div className="mt-3 space-y-3">
              <Field label="Website URL" htmlFor="url" error={errors.url} hint="Example: https://staging.yourproduct.com">
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#756f62]" />
                  <Input
                    id="url"
                    name="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="pl-9"
                    autoComplete="url"
                    aria-invalid={Boolean(errors.url)}
                  />
                </div>
              </Field>
              <Field label="Test name (optional)" htmlFor="name" hint="Shown in history and reports.">
                <Input
                  id="name"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Homepage smoke test"
                  maxLength={200}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[#171512]">Scope and limits</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Browser" htmlFor="browser" hint="Chromium ships with the deployment.">
                <Select
                  id="browser"
                  value={config.browser}
                  onChange={(event) => update('browser', event.target.value as TestConfig['browser'])}
                >
                  <option value="chromium">Chromium (installed)</option>
                  <option value="firefox">Firefox (needs engine install)</option>
                  <option value="webkit">WebKit (needs engine install)</option>
                </Select>
              </Field>
              <Field label="Test timeout" htmlFor="timeout" hint="Per navigation and per check.">
                <Select
                  id="timeout"
                  value={config.timeout_seconds}
                  onChange={(event) => update('timeout_seconds', Number(event.target.value))}
                >
                  {[15, 30, 60, 120, 300].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds} seconds
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Maximum page depth" htmlFor="depth" hint="0 disables crawling beyond the entry page.">
                <Select
                  id="depth"
                  value={config.max_depth}
                  onChange={(event) => update('max_depth', Number(event.target.value))}
                >
                  {[0, 1, 2, 3].map((depth) => (
                    <option key={depth} value={depth}>
                      {depth} level{depth === 1 ? '' : 's'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Maximum pages" htmlFor="pages" hint="Hard capped at 25 by the API.">
                <Input
                  id="pages"
                  type="number"
                  min={1}
                  max={25}
                  value={config.max_pages}
                  onChange={(event) => update('max_pages', Number(event.target.value))}
                />
              </Field>
              <Field label="Maximum links" htmlFor="links" hint="Hard capped at 100 to respect rate limits.">
                <Input
                  id="links"
                  type="number"
                  min={0}
                  max={100}
                  value={config.max_links}
                  onChange={(event) => update('max_links', Number(event.target.value))}
                />
              </Field>
              <Field label="Screenshot capture" htmlFor="shots" hint="Full-page and viewport images are stored per run.">
                <Select
                  id="shots"
                  value={config.capture_screenshots ? 'on' : 'off'}
                  onChange={(event) => update('capture_screenshots', event.target.value === 'on')}
                >
                  <option value="on">Enabled</option>
                  <option value="off">Disabled</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[#171512]">Checks</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Toggle
                label="Link checking"
                description="Verify internal and external links, redirects and 404s."
                checked={config.check_links}
                onChange={(value) => update('check_links', value)}
              />
              <Toggle
                label="Interaction tests"
                description="Click safe controls only; destructive actions are skipped."
                checked={config.test_interactions}
                onChange={(value) => update('test_interactions', value)}
              />
              <Toggle
                label="Form validation"
                description="Inspect labels and required fields without submitting data."
                checked={config.test_forms}
                onChange={(value) => update('test_forms', value)}
              />
              <Toggle
                label="AI analysis"
                description="Use your configured LLM; falls back to rule-based analysis."
                checked={config.ai_analysis}
                onChange={(value) => update('ai_analysis', value)}
              />
            </div>
          </Card>

          <Card className="border-indigo-600/20 bg-indigo-500/[0.04] p-4">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-indigo-700" />
              <div className="text-[11px] leading-relaxed text-[#6b665c]">
                <p className="font-medium text-[#26231f]">Authorization required</p>
                <p className="mt-1">
                  Run tests only against websites you own or have explicit written permission to
                  test. TestPilot blocks private networks, refuses destructive actions, never tries
                  credentials, does not bypass CAPTCHAs and respects rate limits.
                </p>
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[#3f3a33]">
                  <input
                    type="checkbox"
                    checked={authorized}
                    onChange={(event) => setAuthorized(event.target.checked)}
                    className="mt-0.5 size-3.5 accent-indigo-500"
                  />
                  <span>I own this website or have permission to test it.</span>
                </label>
                {errors.authorized ? (
                  <p className="mt-1 text-[11px] text-rose-700" role="alert">
                    {errors.authorized}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={submitting} icon={<Play className="size-4" />}>
              Run test
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfig(DEFAULT_CONFIG)}>
              Reset options
            </Button>
            {activeId ? (
              <Link to={`/reports/${activeId}`} className="ml-auto">
                <Button type="button" variant="secondary" size="sm" icon={<ArrowUpRight className="size-3.5" />}>
                  Report
                </Button>
              </Link>
            ) : null}
          </div>
        </form>

        <div id="live-run" className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {activeId ? (
            <LivePanel
              executionId={activeId}
              url={activeUrl}
              snapshot={snapshot}
              streamError={streamError}
              cancelling={cancelling}
              onCancel={cancel}
            />
          ) : (
            <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#e5dfd1] px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileBarChart className="size-3.5 text-[#2b4b7e]" />
                  <h2 className="text-[12.5px] font-medium text-[#1b1916]">Run configuration</h2>
                </div>
                <span className="font-mono text-[9.5px] text-[#756f62]">
                  {config.browser}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-px bg-[#e5dfd1]">
                {[
                  ['Pages', `${config.max_pages}`],
                  ['Depth', `${config.max_depth}`],
                  ['Links', `${config.max_links || 'off'}`],
                  ['Timeout', `${config.timeout_seconds}s`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[#fdfcf8] px-4 py-2.5">
                    <dt className="mono-label">{label}</dt>
                    <dd className="mt-1 tabular font-mono text-[12px] text-[#26231f]">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-[#e5dfd1] px-4 py-2.5">
                {[
                  ['Links', config.check_links],
                  ['Interactions', config.test_interactions],
                  ['Forms', config.test_forms],
                  ['Screenshots', config.capture_screenshots],
                  ['AI', config.ai_analysis],
                ].map(([label, enabled]) => (
                  <span
                    key={String(label)}
                    className={cn(
                      'rounded-[3px] border px-1.5 py-0.5 text-[10px] ',
                      enabled
                        ? 'border-[#ddd6c8] bg-[#f7f4ed] text-[#4a453d]'
                        : 'border-[#e5dfd1] text-[#b7ad9a] line-through',
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2">
                <ScanLine className="size-3.5 text-[#2b4b7e]" />
                <h2 className="text-[12.5px] font-medium text-[#1b1916]">What will be checked</h2>
              </div>
              <ul className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-[#6b665c]">
                {[
                  ['Page loading', 'HTTP status, title, visible content and load time.'],
                  ['Links', 'Deduplicated internal/external checks with SSRF-safe redirects.'],
                  ['Navigation', 'Bounded internal crawl; navigation dead ends are reported.'],
                  ['Controls', 'Safe buttons are clicked; destructive or ambiguous ones are skipped.'],
                  ['Forms', 'Labels, required fields and constraint validation — never submitted.'],
                  ['Console & network', 'Uncaught errors, failed scripts, styles, images and APIs.'],
                  ['Screenshots', 'Full-page, viewport and failure captures stored per execution.'],
                  ['Report', 'Weighted health score, findings, AI or rule-based analysis, exports.'],
                ].map(([title, detail]) => (
                  <li key={title} className="flex gap-2">
                    <CircleDot className="mt-0.5 size-3 shrink-0 text-[#756f62]" />
                    <span>
                      <span className="font-medium text-[#3f3a33]">{title}.</span> {detail}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#ddd6c8] bg-[#fdfcf8] p-2.5 text-[10px] leading-relaxed text-[#6b665c]">
                <Ban className="mt-0.5 size-3.5 shrink-0 text-[#756f62]" />
                Skipped actions are recorded with an explanation, never silently omitted.
              </div>
            </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
