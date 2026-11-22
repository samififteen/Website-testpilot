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

  const state = unreachable ? 'offline' : system?.browser_installed ? 'ready' : 'checking'

  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={onNavigate}
        className="focus-ring group flex items-center gap-2.5 rounded-[4px] px-1 py-1"
      >
        <span className="grid size-7 place-items-center rounded-[3px] border border-[#d6cdbb] bg-[#fdfcf8]">
          <Radar className="size-3.5 text-[#2b4b7e]" strokeWidth={1.7} />
        </span>
        <span className="serif block text-[17px] leading-none text-[#1b1916]">
          Website<span className="text-[#2b4b7e]">-testpilot</span>
        </span>
      </Link>

      <nav className="mt-8" aria-label="Main navigation">
        {GROUPS.map((group, index) => (
          <div key={group.label} className={index > 0 ? 'mt-6' : undefined}>
            <p className="mono-label mb-1.5 px-2">{group.label}</p>
            <div>
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
                        'focus-ring group relative flex h-8 items-center gap-2.5 rounded-[3px] px-2 text-[12.5px] transition-colors',
                        isActive
                          ? 'bg-[#e9e3d5] font-medium text-[#1b1916]'
                          : 'text-[#6b665c] hover:bg-[#1b1916]/[0.045] hover:text-[#26231f]',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            'size-[15px] shrink-0',
                            isActive ? 'text-[#1b1916]' : 'text-[#756f62] group-hover:text-[#57524a]',
                          )}
                          strokeWidth={1.7}
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

      <div className="mt-auto space-y-2.5 border-t border-[#ddd6c8] pt-4">
        <div className="flex items-center gap-2 px-1 text-[11px] text-[#6f6a5f]">
          <span
            className={cn(
              'size-[5px] rounded-full',
              unreachable ? 'bg-[#b3263c]' : system?.browser_installed ? 'bg-[#14805c]' : 'bg-[#8a6100]',
            )}
            aria-hidden
          />
          <span className="capitalize">{state}</span>
          <span className="text-[#c3b9a6]" aria-hidden>
            ·
          </span>
          <span className="truncate">
            {system
              ? `${system.browser_engine} ${system.browser_version?.split('.')[0] ?? ''} · ${system.executions_stored} runs`
              : 'checking backend…'}
          </span>
        </div>

        <p className="px-1 text-[10.5px] leading-relaxed text-[#756f62]">
          Private networks and destructive actions are blocked. Test sites you own.
        </p>

        <a
          href="/api/docs"
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-[11px] text-[#6f6a5f] underline decoration-[#c3b9a6] underline-offset-2 hover:text-[#1b1916]"
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] border-r border-[#ddd6c8] bg-[#f7f4ed] px-3 py-4 lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[#1b1916]/35 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="animate-in absolute inset-y-0 left-0 w-[268px] border-r border-[#ddd6c8] bg-[#f7f4ed] px-3 py-4">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="focus-ring absolute right-3 top-3 rounded-[3px] p-1 text-[#6f6a5f]"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="relative z-10 lg:pl-[228px]">
        <header className="sticky top-0 z-20 border-b border-[#ddd6c8] bg-[#f1eee7]/90 backdrop-blur-sm">
          <div className="flex h-[50px] items-center gap-3 px-4 sm:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="focus-ring rounded-[3px] border border-[#d6cdbb] p-1.5 text-[#57524a] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </button>

            <div className="flex items-center gap-2 text-[11.5px] text-[#756f62]">
              <span>Local workspace</span>
              <span aria-hidden>/</span>
              <span className="text-[#4a453d]">{currentTitle}</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Link
                to="/history?status=failed"
                className="focus-ring relative rounded-[3px] p-1.5 text-[#6f6a5f] transition-colors hover:bg-[#1b1916]/[0.05] hover:text-[#1b1916]"
                aria-label={failedCount ? `${failedCount} failed runs in history` : 'Notifications'}
                title="Failed runs"
              >
                <Bell className="size-[15px]" strokeWidth={1.7} />
                {failedCount ? (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[#b3263c] ring-2 ring-[#f1eee7]" />
                ) : null}
              </Link>

              <span className="mx-1 h-4 w-px bg-[#ddd6c8]" aria-hidden />

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  className="focus-ring flex items-center gap-2 rounded-[3px] py-1 pl-1 pr-1.5 transition-colors hover:bg-[#1b1916]/[0.05]"
                  aria-expanded={profileOpen}
                  aria-haspopup="menu"
                >
                  <span className="grid size-6 place-items-center rounded-[3px] border border-[#d6cdbb] bg-[#fdfcf8] text-[10px] font-medium text-[#4a453d]">
                    QA
                  </span>
                  <span className="hidden text-[11.5px] text-[#57524a] sm:block">QA Engineer</span>
                  <ChevronDown className="size-3.5 text-[#756f62]" />
                </button>
                {profileOpen ? (
                  <div
                    className="animate-in absolute right-0 top-9 w-56 overflow-hidden rounded-[4px] border border-[#ddd6c8] bg-[#fbf9f4] p-1 shadow-[0_16px_40px_-16px_rgba(27,25,22,0.28)]"
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
                        className="block rounded-[3px] px-2.5 py-1.5 text-[11.5px] text-[#4a453d] hover:bg-[#f0ece2] hover:text-[#1b1916]"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <a
                      href="/api/docs"
                      target="_blank"
                      rel="noreferrer"
                      role="menuitem"
                      className="block rounded-[3px] px-2.5 py-1.5 text-[11.5px] text-[#4a453d] hover:bg-[#f0ece2] hover:text-[#1b1916]"
                    >
                      Open API docs
                    </a>
                    <p className="mt-1 border-t border-[#e5dfd1] px-2.5 py-2 text-[10px] leading-relaxed text-[#756f62]">
                      Single-workspace deployment. Access control is provided by your reverse
                      proxy.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1260px] px-4 py-7 sm:px-8 sm:py-9">
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
    <div className="mb-7 flex flex-col gap-4 border-b border-[#ddd6c8] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1.5 text-[11.5px] text-[#756f62]">{eyebrow}</p> : null}
        <h1 className="serif-title text-[34px] text-[#1b1916] sm:text-[40px]">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-[#6f6a5f]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
