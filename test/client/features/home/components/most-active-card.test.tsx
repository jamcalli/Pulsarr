import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MostActiveCard } from '@/features/home/components/most-active-card'
import type { TopUsers } from '@/features/home/hooks/useTopUsers'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'

function topUsers(data: TopUsers['data'] = []): TopUsers {
  return { days: 30, data, isLoading: false, errorMessage: null }
}

function renderCard(users: TopUsers) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MostActiveCard topUsers={users} />
    </QueryClientProvider>,
  )
}

function rankedUsers(length: number) {
  return Array.from({ length }, (_, index) => ({
    name: `user${index}`,
    count: 20 - index,
    movies: 20 - index,
    shows: 0,
  }))
}

function segments(container: HTMLElement) {
  return container.querySelectorAll('[data-slot="stacked-bar-segment"]')
}

describe('MostActiveCard', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
    server.use(
      http.get('/v1/users/list', () =>
        HttpResponse.json({ success: true, message: 'ok', users: [] }),
      ),
    )
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('scales each row to the most active user', () => {
    const { container } = renderCard(
      topUsers([
        { name: 'jamie', count: 20, movies: 15, shows: 5 },
        { name: 'alex', count: 5, movies: 5, shows: 0 },
      ]),
    )

    expect(screen.getByText('jamie')).toBeInTheDocument()
    expect(screen.getByText('20 items')).toBeInTheDocument()
    expect(screen.getByText('5 items')).toBeInTheDocument()
    expect(screen.getByText('J')).toBeInTheDocument()
    const [topMovies, topShows, second] = segments(container)
    expect(topMovies).toHaveStyle({ width: '75%' })
    expect(topShows).toHaveStyle({ width: '25%' })
    expect(second).toHaveStyle({ width: '25%' })
  })

  it('labels a user by their alias when the admin set one', async () => {
    server.use(
      http.get('/v1/users/list', () =>
        HttpResponse.json({
          success: true,
          message: 'ok',
          users: [
            {
              id: 1,
              name: 'jamie',
              apprise: null,
              alias: 'Jamie Lee',
              discord_id: null,
              notify_apprise: false,
              notify_discord: false,
              notify_discord_mention: false,
              notify_plex_mobile: false,
              can_sync: true,
              requires_approval: false,
              is_primary_token: false,
              avatar: null,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      ),
    )
    renderCard(topUsers([{ name: 'jamie', count: 20, movies: 15, shows: 5 }]))

    expect(await screen.findByText('Jamie Lee')).toBeInTheDocument()
    expect(screen.queryByText('jamie')).not.toBeInTheDocument()
  })

  it('splits each row into movie and show segments under one legend', () => {
    renderCard(
      topUsers([
        { name: 'jamie', count: 20, movies: 15, shows: 5 },
        { name: 'alex', count: 5, movies: 2, shows: 3 },
      ]),
    )

    for (const name of ['Movies: 15', 'Shows: 5', 'Movies: 2', 'Shows: 3']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    const legend = screen.getByRole('list')
    expect(within(legend).getByText('Movies')).toBeInTheDocument()
    expect(within(legend).getByText('Shows')).toBeInTheDocument()
  })

  it('shows the top five users and summarises the rest', () => {
    renderCard(topUsers(rankedUsers(8)))

    expect(screen.getByText('user4')).toBeInTheDocument()
    expect(screen.queryByText('user5')).not.toBeInTheDocument()
    expect(screen.getByText('+3 more users, 42 items')).toBeInTheDocument()
  })

  it('hides View all when five users or fewer are ranked', () => {
    renderCard(topUsers(rankedUsers(5)))

    expect(screen.getByText('user4')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View all' }),
    ).not.toBeInTheDocument()
  })

  it('lists every user with the legend in the View all credenza', async () => {
    const user = userEvent.setup()
    renderCard(topUsers(rankedUsers(8)))

    await user.click(screen.getByRole('button', { name: 'View all' }))

    const dialog = await screen.findByRole('dialog', { name: 'Most active' })
    expect(dialog).toHaveAccessibleDescription('Last 30 days')
    expect(within(dialog).getByText('user7')).toBeInTheDocument()
    expect(within(dialog).getByText('13 items')).toBeInTheDocument()
    expect(within(dialog).getByText('Movies')).toBeInTheDocument()
  })

  it('shows the empty state without activity', () => {
    renderCard(topUsers())

    expect(screen.getByText('No activity in this range.')).toBeInTheDocument()
  })
})
