import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  api: {
    dashboard: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 0
  },
}))

import { api } from '../api'
import { Overview } from '../pages/Overview'
import { dashboard } from './fixtures'

const dashboardMock = vi.mocked(api.dashboard)

function renderOverview() {
  return render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>,
  )
}

describe('Overview', () => {
  beforeEach(() => {
    dashboardMock.mockReset()
  })

  it('renders statistics computed from the API response', async () => {
    dashboardMock.mockResolvedValue(dashboard)
    renderOverview()

    expect(await screen.findByText('Total tests')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('5.4 s')).toBeInTheDocument()
    expect(screen.getByText('Website health')).toBeInTheDocument()
    expect(screen.getByText('52')).toBeInTheDocument()
    expect(screen.getByText('Example Domain')).toBeInTheDocument()
  })

  it('shows an empty state when nothing has been executed', async () => {
    dashboardMock.mockResolvedValue({
      ...dashboard,
      recent: [],
      activity: dashboard.activity.map((point) => ({
        ...point,
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
      })),
      health: { ...dashboard.health, has_data: false, health_score: null },
      stats: { ...dashboard.stats, total_tests: 0 },
    })
    renderOverview()

    expect(await screen.findByText('No activity yet')).toBeInTheDocument()
    expect(screen.getByText('No test runs yet')).toBeInTheDocument()
    expect(screen.getByText('No health data')).toBeInTheDocument()
  })

  it('surfaces API failures without crashing', async () => {
    dashboardMock.mockRejectedValue(new Error('offline'))
    renderOverview()
    expect(await screen.findByText(/Could not reach the TestPilot API/)).toBeInTheDocument()
  })
})
