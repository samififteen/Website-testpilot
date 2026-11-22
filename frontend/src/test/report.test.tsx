import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    report: vi.fn(),
    rerun: vi.fn(),
    exportJsonUrl: (id: string) => `/api/tests/${id}/export/json`,
    exportHtmlUrl: (id: string) => `/api/tests/${id}/export/html`,
  },
  ApiError: class ApiError extends Error {
    status = 0
  },
}))

import { api } from '../api'
import { ToastProvider } from '../components/Toast'
import { Report } from '../pages/Report'
import { report } from './fixtures'

function renderReport() {
  return render(
    <MemoryRouter initialEntries={['/reports/abc123']}>
      <ToastProvider>
        <Routes>
          <Route path="/reports/:id" element={<Report />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('Report page', () => {
  beforeEach(() => {
    vi.mocked(api.report).mockReset()
    vi.mocked(api.report).mockResolvedValue(report)
  })

  it('renders the report header, analysis and summary', async () => {
    renderReport()
    expect(await screen.findByText('Homepage smoke')).toBeInTheDocument()
    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.getByText(/two blocking issues/i)).toBeInTheDocument()
    expect(screen.getByText(/Moderate risk/i)).toBeInTheDocument()
    expect(screen.getByText(/Rule-based analysis/i)).toBeInTheDocument()
    expect(screen.getAllByText('Links resolve').length).toBeGreaterThan(0)
  })

  it('filters the results table by status', async () => {
    const user = userEvent.setup()
    renderReport()

    expect(await screen.findByText('Page loads successfully')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Failed/ }))

    const table = within(screen.getByRole('table'))
    expect(table.queryByText('Page loads successfully')).not.toBeInTheDocument()
    expect(table.getByText('Links resolve')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Warnings/ }))
    expect(within(screen.getByRole('table')).getByText('Basic accessibility structure')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('Links resolve')).not.toBeInTheDocument()
  })

  it('opens the detail modal for a check', async () => {
    const user = userEvent.setup()
    renderReport()
    await screen.findByText('Page loads successfully')
    await user.click(screen.getAllByRole('button', { name: /open/i })[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByText(/HTTP 200 in 800 ms/).length).toBeGreaterThan(0)
  })

  it('exposes JSON and HTML export links with real endpoints', async () => {
    const user = userEvent.setup()
    renderReport()
    await screen.findByText('Homepage smoke')
    const json = screen.getByRole('link', { name: /json/i })
    expect(json).toHaveAttribute('href', '/api/tests/abc123/export/json')
    const html = screen.getByRole('link', { name: /html/i })
    expect(html).toHaveAttribute('href', '/api/tests/abc123/export/html')

    await user.click(json)
    expect(json).toHaveAttribute('download')
  })
})
