import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecentRequests } from '@/features/home/components/recent-requests'
import type { RecentRequestsState } from '@/features/home/hooks/useRecentRequests'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { stubViewport } from '../../../viewport.js'

function recentRequests(): RecentRequestsState {
  return {
    view: 'list',
    setView: vi.fn(),
    limit: 10,
    setLimit: vi.fn(),
    status: 'all',
    setStatus: vi.fn(),
    items: [],
    isLoading: false,
    isReady: true,
    errorMessage: null,
  }
}

function renderCard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecentRequests recent={recentRequests()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RecentRequests', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('draws the status filter as a full-width select on a phone', () => {
    stubViewport({ mobile: true })
    renderCard()

    expect(
      screen.getByRole('combobox', { name: 'All statuses' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Status' }),
    ).not.toBeInTheDocument()
  })
})
