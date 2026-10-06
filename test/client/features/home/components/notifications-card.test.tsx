import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router-dom'
import { NotificationsCard } from '@/features/home/components/analytics/notifications-card'
import { setFormatLocale } from '@/lib/format'
import { NAV_PAGES, pageHref } from '@/lib/navigation'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'

const stats = {
  total_notifications: 120,
  by_channel: [
    { channel: 'discord', count: 80 },
    { channel: 'plex_mobile', count: 60 },
    { channel: 'apprise', count: 10 },
    { channel: 'native_webhook', count: 5 },
  ],
  by_type: [
    { type: 'movie', count: 40 },
    { type: 'episode', count: 30 },
    { type: 'season', count: 6 },
    { type: 'watchlist_add', count: 20 },
    { type: 'watchlist_removed', count: 4 },
    { type: 'watchlist_cap', count: 2 },
    { type: 'approval_resolved', count: 8 },
    { type: 'approval_auto', count: 7 },
    { type: 'user_created', count: 3 },
  ],
  by_user: [],
}

function mockEndpoints(enabled: boolean[]) {
  server.use(
    http.get('/v1/webhooks/endpoints', () =>
      HttpResponse.json({
        success: true,
        data: enabled.map((isEnabled, index) => ({
          id: index + 1,
          name: `Hook ${index + 1}`,
          url: 'https://example.com/hook',
          authHeaderName: null,
          authHeaderValue: null,
          eventTypes: ['approval.resolved'],
          enabled: isEnabled,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        })),
      }),
    ),
  )
}

function renderCard() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationsCard stats={stats} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fills(container: HTMLElement) {
  return container.querySelectorAll('[data-slot="stat-bar-fill"]')
}

describe('NotificationsCard', () => {
  beforeEach(() => setFormatLocale('en-US'))

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
  })

  it('draws a bar for every channel and type when a webhook is enabled', async () => {
    mockEndpoints([false, true])
    const { container } = renderCard()

    expect(await screen.findByText('Approval decided')).toBeInTheDocument()
    expect(fills(container)).toHaveLength(4 + 9)
    expect(screen.queryByText('Webhook only')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Only recorded when a native webhook is set up.'),
    ).not.toBeInTheDocument()
  })

  it('dims webhook-only rows and collapses webhook-only families without one', async () => {
    mockEndpoints([false])
    renderCard()

    const removed = await screen.findByText('Removed from watchlist')
    expect(removed.parentElement).toHaveClass('opacity-60')
    expect(removed.parentElement).toHaveTextContent('Webhook only')
    expect(screen.getAllByText('Webhook only')).toHaveLength(1)
    expect(screen.getByText('Added to watchlist')).toBeInTheDocument()

    expect(screen.queryByText('Approval decided')).not.toBeInTheDocument()
    expect(screen.queryByText('Auto approved')).not.toBeInTheDocument()
    expect(
      screen.getAllByText('Only recorded when a native webhook is set up.'),
    ).toHaveLength(2)
    for (const link of screen.getAllByRole('button', {
      name: 'Set up native webhook',
    })) {
      expect(link).toHaveAttribute('href', pageHref(NAV_PAGES.webhooks))
    }
  })
})
