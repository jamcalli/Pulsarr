import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { delay, HttpResponse, http } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import HomePage from '@/features/home'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { useProgressStore } from '@/stores/progressStore'
import { server } from '../../setup.js'
import { dashboardStats } from './dashboard-stats.js'

function renderPage() {
  const router = createMemoryRouter([{ path: '*', element: <HomePage /> }])
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    // keeps subscribers from opening the progress EventSource
    useProgressStore.setState({ isConnecting: true, systemStatusCache: {} })
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
  })

  it('keeps the skeleton up while recent requests are still loading', async () => {
    const served: string[] = []
    server.use(
      http.get('/v1/stats/recent-requests', () => delay('infinite')),
      http.get('/v1/stats/all', () => {
        served.push('all')
        return HttpResponse.json(dashboardStats().data)
      }),
      http.get('/v1/stats/users', () => {
        served.push('users')
        return HttpResponse.json([])
      }),
      http.get('/v1/stats/genres', () => {
        served.push('genres')
        return HttpResponse.json([])
      }),
      http.get('/v1/approval/stats', () => {
        served.push('approvals')
        return HttpResponse.json({
          success: true,
          message: 'ok',
          stats: {
            pending: 0,
            approved: 0,
            rejected: 0,
            expired: 0,
            auto_approved: 0,
            totalRequests: 0,
          },
        })
      }),
    )
    renderPage()

    await waitFor(() =>
      expect([...served].sort()).toEqual([
        'all',
        'approvals',
        'genres',
        'users',
      ]),
    )
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Home' }),
    ).not.toBeInTheDocument()
  })
})
