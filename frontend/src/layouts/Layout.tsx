import {
  Bell,
  ChevronDown,
  FileBarChart,
  History,
  LayoutDashboard,
  Menu,
  PlusCircle,
  Radar,
  Settings as SettingsIcon,
  Terminal,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api'
import { cn } from '../components/ui'
import type { SystemInfo } from '../types'

const GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/new', label: 'New Test', icon: PlusCircle },
      { to: '/history', label: 'Test History', icon: History },
      { to: '/reports', label: 'Test Reports', icon: FileBarChart },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: SettingsIcon }],
  },
]

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/new': 'New Test',
  '/history': 'Test History',
  '/reports': 'Test Reports',
  '/settings': 'Settings',
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [unreachable, setUnreachable] = useState(false)

  useEffect(() => {
    let active = true
    api
      .systemInfo()
      .then((info) => active && setSystem(info))
      .catch(() => active && setUnreachable(true))
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className="focus-ring group flex items-center gap-2.5 rounded-lg px-1.5 py-1"
      >
        <span className="relative grid size-7 place-items-center rounded-[7px] border border-[#2b3140] bg-[#0f1219]">
          <Radar className="size-3.5 text-[#a3abff]" />
          <span className="absolute inset-0 rounded-[7px] bg-[#7c86ff]/10 blur-[6px]" aria-hidden />
        </span>
        <span className="leading-none">
          <span className="block text-[13.5px] font-semibold tracking-[-0.015em] text-[#f0f1f6]">
            TestPilot<span className="text-[#7c86ff]">.ai</span>
          </span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.18em] text-[#5f6776]">
            Website QA agent
          </span>
        </span>
      </Link>

      <nav className="mt-7 space-y-6" aria-label="Main navigation">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mono-label mb-2 px-2">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'focus-ring group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[12.5px] transition-colors',
                        isActive
                          ? 'bg-[#12151d] text-[#eef0f7]'
                          : 'text-[#8b93a3] hover:bg-white/[0.03] hover:text-[#d6dae4]',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <span className="absolute -left-2 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[#7c86ff]" />
                        ) : null}
                        <Icon
                          className={cn(
                            'size-[15px] shrink-0',
                            isActive ? 'text-[#a3abff]' : 'text-[#5f6776] group-hover:text-[#8b93a3]',
                          )}
                          strokeWidth={1.8}
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div className="rounded-lg border border-[#191d26] bg-[#0a0c11] p-2.5">
          <div className="flex items-center justify-between">
            <span className="mono-label">Engine</span>
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wide text-[#7d8595]">
              <span
                className={cn(
                  'size-[5px] rounded-full',
                  unreachable ? 'bg-[#fb7185]' : system?.browser_installed ? 'bg-[#3ddc97] pulse-dot' : 'bg-[#f5c451]',
                )}
              />
              {unreachable ? 'offline' : system?.browser_installed ? 'ready' : 'checking'}
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#626b7a]">
            {system
              ? `${system.browser_engine} ${system.browser_version?.split('.')[0] ?? ''} · SQLite · ${system.executions_stored} runs`
              : 'Checking backend and browser…'}
          </p>
        </div>

        <div className="rounded-lg border border-[#191d26] bg-[#0a0c11] p-2.5">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#7d8595]">
            <Terminal className="size-3" /> Authorized targets only
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#5f6776]">
            Private networks and destructive actions are blocked. Test sites you own.
          </p>
        </div>

        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className="focus-ring flex items-center justify-between rounded-md px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide text-[#5f6776] hover:text-[#a4abba]"
        >
          API reference
          <span aria-hidden>↗</span>
        </a>
      </div>
    </div>
  )
}

export function Layout() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [failedCount, setFailedCount] = useState<number | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const currentTitle =
    TITLES[location.pathname] ??
    (location.pathname.startsWith('/reports/') ? 'Report' : 'Workspace')

  useEffect(() => {
    setMobileOpen(false)
    setProfileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let active = true
    const load = () => {
      api
        .listTests({ status: 'failed', page_size: 1 })
        .then((result) => active && setFailedCount(result.total))
        .catch(() => undefined)
    }
    load()
    const timer = window.setInterval(load, 30_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [location.pathname])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative min-h-screen">
      <div className="ambient" aria-hidden />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r border-[#14171e] bg-[#07080b]/85 px-3 py-4 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="animate-in absolute inset-y-0 left-0 w-[268px] border-r border-[#1b1e27] bg-[#080a0e] px-3 py-4">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="focus-ring absolute right-3 top-3 rounded p-1 text-[#8b93a3]"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="relative z-10 lg:pl-[236px]">
        <header className="sticky top-0 z-20 border-b border-[#14171e] bg-[#06070a]/80 backdrop-blur-xl">
          <div className="flex h-[52px] items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="focus-ring rounded-md border border-[#242936] p-1.5 text-[#a4abba] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>

            <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em]">
              <span className="text-[#5f6776]">Local workspace</span>
              <span className="text-[#333a48]">/</span>
              <span className="text-[#b7becb]">{currentTitle}</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to="/history?status=failed"
                className="focus-ring relative rounded-md p-1.5 text-[#7d8595] transition-colors hover:bg-white/[0.04] hover:text-[#d6dae4]"
                aria-label={failedCount ? `${failedCount} failed runs in history` : 'Notifications'}
                title="Failed runs"
              >
                <Bell className="size-[15px]" />
                {failedCount ? (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[#fb7185] ring-2 ring-[#06070a]" />
                ) : null}
              </Link>

              <span className="mx-1 h-4 w-px bg-[#1b1e27]" aria-hidden />

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  className="focus-ring flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 transition-colors hover:bg-white/[0.04]"
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                >
                  <span className="grid size-6 place-items-center rounded-[5px] border border-[#2b3140] bg-[#12151d] font-mono text-[10px] text-[#c3c9d6]">
                    QA
                  </span>
                  <span className="hidden text-[11.5px] text-[#a4abba] sm:block">QA Engineer</span>
                  <ChevronDown className="size-3.5 text-[#5f6776]" />
                </button>
                {profileOpen ? (
                  <div
                    className="animate-in absolute right-0 top-9 w-56 overflow-hidden rounded-lg border border-[#262b38] bg-[#0b0d12] p-1 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]"
                    role="menu"
                  >
                    {[
                      { to: '/settings', label: 'Workspace settings' },
                      { to: '/new', label: 'Start a new test' },
                    ].map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        className="block rounded-md px-2.5 py-1.5 text-[11.5px] text-[#b7becb] hover:bg-white/[0.05] hover:text-[#eef0f7]"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <a
                      href="/api/docs"
                      target="_blank"
                      rel="noreferrer"
                      role="menuitem"
                      className="block rounded-md px-2.5 py-1.5 text-[11.5px] text-[#b7becb] hover:bg-white/[0.05] hover:text-[#eef0f7]"
                    >
                      Open API docs
                    </a>
                    <p className="mt-1 border-t border-[#191d26] px-2.5 py-2 text-[10px] leading-relaxed text-[#5f6776]">
                      Single-workspace deployment. Access control is provided by your reverse
                      proxy.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6 sm:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-[#14171e] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mono-label mb-2 text-[#7c86ff]/80">{eyebrow}</p> : null}
        <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-[#f0f1f6] sm:text-[26px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-[#7d8595]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
