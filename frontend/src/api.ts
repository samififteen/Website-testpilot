import type {
  DashboardData,
  ExecutionDetail,
  Paginated,
  ReportResponse,
  SettingsPayload,
  SettingsResponse,
  StreamSnapshot,
  SystemInfo,
  TestConfig,
  TestExecution,
  TestResultItem,
  Screenshot,
} from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((item: { msg?: string; loc?: unknown[] }) => item.msg ?? JSON.stringify(item))
          .join('; ')
      }
    } catch {
      /* keep the status message */
    }
    throw new ApiError(detail, response.status)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export interface TestCreatePayload {
  url: string
  name?: string
  authorized: boolean
  config: TestConfig
}

export interface ListParams {
  page?: number
  page_size?: number
  status?: string
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
}

function query(params: ListParams): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const suffix = search.toString()
  return suffix ? `?${suffix}` : ''
}

export const api = {
  health: () => request<{ status: string; version: string; database: string }>('/api/health'),

  dashboard: (days = 14) => request<DashboardData>(`/api/dashboard?days=${days}`),

  listTests: (params: ListParams = {}) => request<Paginated<TestExecution>>(`/api/tests${query(params)}`),

  getTest: (id: string) => request<ExecutionDetail>(`/api/tests/${id}`),

  createTest: (payload: TestCreatePayload) =>
    request<TestExecution>('/api/tests', { method: 'POST', body: JSON.stringify(payload) }),

  rerun: (id: string) => request<TestExecution>(`/api/tests/${id}/rerun`, { method: 'POST' }),

  cancel: (id: string) => request<TestExecution>(`/api/tests/${id}/cancel`, { method: 'POST' }),

  deleteTest: (id: string) => request<void>(`/api/tests/${id}`, { method: 'DELETE' }),

  report: (id: string) => request<ReportResponse>(`/api/tests/${id}/report`),

  results: (id: string) => request<TestResultItem[]>(`/api/tests/${id}/results`),

  screenshots: (id: string) => request<Screenshot[]>(`/api/tests/${id}/screenshots`),

  // Reports are generated server-side; navigate/fetch these URLs directly.
  exportJsonUrl: (id: string) => `${BASE}/api/tests/${id}/export/json`,

  exportHtmlUrl: (id: string) => `${BASE}/api/tests/${id}/export/html`,

  getSettings: () => request<SettingsResponse>('/api/settings'),

  updateSettings: (payload: SettingsPayload) =>
    request<SettingsResponse>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  systemInfo: () => request<SystemInfo>('/api/system/info'),
}

/** Subscribe to live execution progress over Server-Sent Events. */
export function subscribeToExecution(
  id: string,
  handlers: {
    onUpdate: (snapshot: StreamSnapshot) => void
    onDone?: (status: string) => void
    onError?: () => void
  },
): () => void {
  if (typeof EventSource === 'undefined') {
    handlers.onError?.()
    return () => {}
  }
  const source = new EventSource(`${BASE}/api/tests/${id}/events`)
  const update = (event: MessageEvent<string>) => {
    try {
      handlers.onUpdate(JSON.parse(event.data) as StreamSnapshot)
    } catch {
      /* ignore malformed frames */
    }
  }
  const done = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { status: string }
      handlers.onDone?.(payload.status)
    } catch {
      handlers.onDone?.('')
    }
    source.close()
  }
  source.addEventListener('update', update as EventListener)
  source.addEventListener('done', done as EventListener)
  source.onerror = () => {
    handlers.onError?.()
  }
  return () => source.close()
}
