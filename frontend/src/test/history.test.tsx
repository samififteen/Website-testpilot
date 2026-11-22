import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    listTests: vi.fn(),
    rerun: vi.fn(),
    deleteTest: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0
  },
}))

import { api } from '../api'
import { ToastProvider } from '../components/Toast'
import { History } from '../pages/History'
import { execution } from './fixtures'

function renderHistory() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <History />
      </ToastProvider>
    </MemoryRouter>,
  )
}

describe('Test history', () => {
  beforeEach(() => {
    vi.mocked(api.listTests).mockReset()
    vi.mocked(api.listTests).mockResolvedValue({
      items: [execution],
      total: 1,
      page: 1,
      page_size: 10,
      pages: 1,
    })
  })

  it('lists stored executions with real counts', async () => {
    renderHistory()
    expect(await screen.findByText('Homepage smoke')).toBeInTheDocument()
    expect(screen.getByText('1 execution · page 1 of 1')).toBeInTheDocument()
    expect(screen.getByText('52')).toBeInTheDocument()
  })

  it('searches with the API search parameter', async () => {
    const user = userEvent.setup()
    renderHistory()
    await screen.findByText('Homepage smoke')
    await user.type(screen.getByLabelText(/search test history/i), 'alpha')
    await waitFor(
      () => {
        const lastCall = vi.mocked(api.listTests).mock.calls.at(-1)?.[0]
        expect(lastCall?.search).toBe('alpha')
      },
      { timeout: 2000 },
    )
  })

  it('asks for confirmation before deleting', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deleteTest).mockResolvedValue(undefined)
    renderHistory()
    await screen.findByText('Homepage smoke')

    await user.click(screen.getByRole('button', { name: /delete https:\/\/example.com\//i }))
    expect(await screen.findByText('Delete this execution?')).toBeInTheDocument()
    expect(api.deleteTest).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /delete permanently/i }))
    await waitFor(() => expect(api.deleteTest).toHaveBeenCalledWith('abc123'))
  })
})
