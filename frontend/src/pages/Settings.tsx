import {
  Bot,
  Camera,
  CheckCircle2,
  Database,
  Info,
  Save,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { useToast } from '../components/Toast'
import { Button, Card, Field, Input, Select, Skeleton, Toggle, cn } from '../components/ui'
import { PageHeader } from '../layouts/Layout'
import type { SettingsPayload, SystemInfo } from '../types'

export function Settings() {
  const toast = useToast()
  const [settings, setSettings] = useState<SettingsPayload | null>(null)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [aiSource, setAiSource] = useState('')
  const [readOnly, setReadOnly] = useState<string[]>([])
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsResponse, info] = await Promise.all([api.getSettings(), api.systemInfo()])
      setSettings(settingsResponse.settings)
      setAiConfigured(settingsResponse.ai_configured)
      setAiSource(settingsResponse.ai_key_source)
      setReadOnly(settingsResponse.read_only_config)
      setSystem(info)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = <K extends keyof SettingsPayload>(key: K, value: SettingsPayload[K]) =>
    setSettings((current) => (current ? { ...current, [key]: value } : current))

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const response = await api.updateSettings(settings)
      setSettings(response.settings)
      toast.push('success', 'Settings saved', 'New tests use these defaults.')
    } catch (err) {
      toast.push('error', 'Could not save settings', err instanceof ApiError ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  if (error || !settings) {
    return (
      <Card className="p-5">
        <p className="text-sm text-rose-200">{error ?? 'Settings unavailable.'}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Defaults for new tests, AI configuration and verified system status."
        actions={
          <Button loading={saving} onClick={() => void save()} icon={<Save className="size-3.5" />}>
            Save changes
          </Button>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <SettingsIcon className="size-4 text-indigo-300" />
            <h2 className="text-sm font-semibold text-[#f0f1f6]">Testing defaults</h2>
          </div>
          <p className="mt-1 text-[11px] text-[#6b7280]">
            Applied to new tests created from the API when a field is omitted, and pre-filled in the
            New Test form.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Default timeout (seconds)" htmlFor="timeout">
              <Input
                id="timeout"
                type="number"
                min={10}
                max={300}
                value={settings.default_timeout_seconds}
                onChange={(event) => patch('default_timeout_seconds', Number(event.target.value))}
              />
            </Field>
            <Field label="Maximum pages" htmlFor="max-pages">
              <Input
                id="max-pages"
                type="number"
                min={1}
                max={25}
                value={settings.default_max_pages}
                onChange={(event) => patch('default_max_pages', Number(event.target.value))}
              />
            </Field>
            <Field label="Maximum links" htmlFor="max-links">
              <Input
                id="max-links"
                type="number"
                min={0}
                max={100}
                value={settings.default_max_links}
                onChange={(event) => patch('default_max_links', Number(event.target.value))}
              />
            </Field>
            <Field label="Maximum crawl depth" htmlFor="max-depth">
              <Input
                id="max-depth"
                type="number"
                min={0}
                max={3}
                value={settings.default_max_depth}
                onChange={(event) => patch('default_max_depth', Number(event.target.value))}
              />
            </Field>
            <Field label="Maximum concurrency" htmlFor="concurrency" hint="Per-process worker limit. Server restart applies the change.">
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={8}
                value={settings.max_concurrency}
                onChange={(event) => patch('max_concurrency', Number(event.target.value))}
              />
            </Field>
            <Field label="Default browser" htmlFor="browser">
              <Select
                id="browser"
                value={settings.default_browser}
                onChange={(event) =>
                  patch('default_browser', event.target.value as SettingsPayload['default_browser'])
                }
              >
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
                <option value="webkit">WebKit</option>
              </Select>
            </Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-violet-300" />
              <h2 className="text-sm font-semibold text-[#f0f1f6]">AI analysis</h2>
              <span
                className={cn(
                  'ml-auto rounded-full border px-2 py-0.5 text-[10px]',
                  aiConfigured
                    ? 'border-violet-400/30 bg-violet-500/10 text-violet-200'
                    : 'border-[#262b38] bg-[#11111a] text-[#8b93a3]',
                )}
              >
                {aiConfigured ? 'Key configured' : 'Rule-based mode'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <Toggle
                label="Enable AI analysis by default"
                description="When no key is present, reports use the deterministic rule-based analyzer."
                checked={settings.ai_enabled}
                onChange={(value) => patch('ai_enabled', value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Provider" htmlFor="provider" hint="OpenAI-compatible chat completions.">
                  <Select
                    id="provider"
                    value={settings.ai_provider}
                    onChange={(event) => patch('ai_provider', event.target.value)}
                  >
                    <option value="openai">OpenAI-compatible</option>
                  </Select>
                </Field>
                <Field label="Model" htmlFor="model">
                  <Input
                    id="model"
                    value={settings.ai_model}
                    onChange={(event) => patch('ai_model', event.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </Field>
              </div>
              <div className="rounded-lg border border-[#1b1e27] bg-[#0a0c11] p-2.5 text-[10px] leading-relaxed text-[#6b7280]">
                <p className="flex items-center gap-1.5 text-[#8b93a3]">
                  <ShieldCheck className="size-3.5" /> Server-side key only
                </p>
                <p className="mt-1">
                  Source: {aiSource}. Keys are never returned by the API or stored in the browser.
                  Set <code className="text-[#8b93a3]">AI_API_KEY</code> (or{' '}
                  <code className="text-[#8b93a3]">OPENAI_API_KEY</code>) in the backend
                  environment, then restart the server.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Camera className="size-4 text-indigo-300" />
              <h2 className="text-sm font-semibold text-[#f0f1f6]">Screenshots</h2>
            </div>
            <div className="mt-3 space-y-2">
              <Toggle
                label="Capture screenshots by default"
                description="Full-page and viewport PNGs are stored per execution and served only through the API."
                checked={settings.capture_screenshots}
                onChange={(value) => patch('capture_screenshots', value)}
              />
              <Field
                label="Image storage"
                htmlFor="storage"
                hint="Files live on the server (Docker volume or ./backend/screenshots)."
              >
                <Select
                  id="storage"
                  value={settings.screenshot_storage}
                  onChange={(event) => patch('screenshot_storage', event.target.value)}
                >
                  <option value="local">Local filesystem</option>
                </Select>
              </Field>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Server className="size-4 text-indigo-300" />
          <h2 className="text-sm font-semibold text-[#f0f1f6]">System status</h2>
          <span className="text-[10px] uppercase tracking-wide text-[#5f6776]">
            verified by the backend, not cached in the browser
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void load()}>
            Re-check
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: <Server className="size-3.5" />,
              label: 'Backend',
              value: system ? `${system.backend_status.toUpperCase()} · v${system.version}` : 'unknown',
              ok: system?.backend_status === 'ok',
            },
            {
              icon: <Database className="size-3.5" />,
              label: 'Database',
              value: system
                ? `${system.database_status} · ${system.database_url_scheme} · ${system.executions_stored} runs`
                : 'unknown',
              ok: system?.database_status === 'ok',
            },
            {
              icon: <CheckCircle2 className="size-3.5" />,
              label: 'Browser engine',
              value: system
                ? system.browser_installed
                  ? `${system.browser_engine} ${system.browser_version ?? ''}`
                  : `${system.browser_engine} not installed`
                : 'unknown',
              ok: Boolean(system?.browser_installed),
            },
            {
              icon: <Bot className="size-3.5" />,
              label: 'Analysis mode',
              value: system ? `${system.ai_mode} (${system.ai_provider})` : 'unknown',
              ok: Boolean(system),
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[#1b1e27] bg-[#0a0c11] p-2.5">
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[#6b7280]">
                {item.icon} {item.label}
              </p>
              <p
                className={cn(
                  'mt-1 text-[11px] font-medium',
                  item.ok ? 'text-emerald-300' : 'text-amber-300',
                )}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-2 text-[11px] text-[#6b7280] sm:grid-cols-2 xl:grid-cols-3">
          <p>
            Screenshots stored: <span className="text-[#c3c9d6]">{system?.screenshots_stored ?? 0}</span>
          </p>
          <p>
            Concurrency limit:{' '}
            <span className="text-[#c3c9d6]">{system?.max_concurrency ?? '—'}</span>
          </p>
          <p>
            Uptime:{' '}
            <span className="text-[#c3c9d6]">
              {system ? `${Math.round(system.uptime_seconds)}s` : '—'}
            </span>
          </p>
        </div>

        {system?.allow_local_targets ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 p-2.5 text-[11px] text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Local/private targets are enabled on this server
            (TESTPILOT_ALLOW_LOCAL_TARGETS). This is intended only for the bundled fixture site and
            must stay off in production.
          </p>
        ) : null}

        <div className="mt-3 rounded-lg border border-[#1b1e27] bg-[#0a0c11] p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-[#6b7280]">
            <Info className="size-3" /> Fixed by the server environment
          </p>
          <ul className="mt-1.5 space-y-1 text-[11px] text-[#6b7280]">
            {readOnly.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  )
}
