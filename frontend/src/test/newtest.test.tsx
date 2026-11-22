import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    getSettings: vi.fn(),
    createTest: vi.fn(),
    cancel: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0
  },
  subscribeToExecution: vi.fn(() => () => undefined),
}))

import { api } from '../api'
import { ToastProvider } from '../components/Toast'
import { NewTest } from '../pages/NewTest'
import { execution } from './fixtures'

const settings = {
  settings: {
    default_timeout_seconds: 60,
    default_max_pages: 5,
    default_max_links: 25,
    default_max_depth: 1,
    max_concurrency: 2,
    default_browser: 'chromium' as const,
    ai_enabled: false,
    ai_provider: 'openai',
    ai_model: 'gpt-4o-mini',
    capture_screenshots: true,
    screenshot_storage: 'local',
  },
  ai_configured: false,
  ai_key_source: 'not configured',
  read_only_config: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <NewTest />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('New test form', () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockResolvedValue(settings)
    vi.mocked(api.createTest).mockReset()
  })

  it('rejects an empty URL', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /run test/i }))
    expect(await screen.findByText(/Enter the website URL/i)).toBeInTheDocument()
    expect(api.createTest).not.toHaveBeenCalled()
  })

  it('rejects non-HTTP schemes and private targets', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByLabelText(/website url/i)

    await user.type(input, 'ftp://example.com')
    await user.click(screen.getByRole('button', { name: /run test/i }))
    expect(await screen.findByText(/Only HTTP and HTTPS URLs/i)).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'http://192.168.1.20/admin')
    await user.click(screen.getByRole('button', { name: /run test/i }))
    expect(await screen.findByText(/Private, link-local and internal hosts/i)).toBeInTheDocument()
    expect(api.createTest).not.toHaveBeenCalled()
  })

  it('requires the authorization confirmation', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/website url/i), 'https://example.com')
    await user.click(screen.getByRole('button', { name: /run test/i }))
    expect(await screen.findByText(/Confirm you have permission/i)).toBeInTheDocument()
    expect(api.createTest).not.toHaveBeenCalled()
  })

  it('starts a real execution and shows the live panel', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createTest).mockResolvedValue({ ...execution, status: 'queued' })
    renderPage()

    await user.type(screen.getByLabelText(/website url/i), 'https://example.com')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /run test/i }))

    await waitFor(() => expect(api.createTest).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(api.createTest).mock.calls[0][0]
    expect(payload.url).toBe('https://example.com')
    expect(payload.authorized).toBe(true)
    expect(payload.config.browser).toBe('chromium')
    expect(payload.config.ai_analysis).toBe(false)

    expect(await screen.findByText('Live execution')).toBeInTheDocument()
    expect(screen.getByText('abc123')).toBeInTheDocument()
  })
})
