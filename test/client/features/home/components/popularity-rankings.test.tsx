import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { PopularityRankings } from '@/features/home/components/popularity-rankings'
import { setFormatLocale } from '@/lib/format'
import { queryClient } from '@/lib/queryClient'
import { server } from '../../../setup.js'
import { stubViewport } from '../../../viewport.js'
import { dashboardStats } from '../dashboard-stats.js'

const stats = dashboardStats({
  most_watched_shows: [
    {
      title: 'Severance',
      count: 12,
      thumb: null,
      content_type: 'show',
      users: ['ana', 'ben', 'cal', 'dee'],
    },
  ],
  most_watched_movies: [],
})

function renderRankings() {
  return render(
    <QueryClientProvider client={queryClient}>
      <PopularityRankings stats={stats} recentRequests={[]} />
    </QueryClientProvider>,
  )
}

function shelf(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name })
  const section = heading.closest('section')
  if (!section) throw new Error(`${name} has no shelf`)
  return section
}

describe('PopularityRankings', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    server.use(
      http.get('/v1/users/list', () =>
        HttpResponse.json({ success: true, message: 'ok', users: [] }),
      ),
      http.get('/v1/config', () =>
        HttpResponse.json({ success: true, config: { tmdbRegion: 'US' } }),
      ),
    )
  })

  afterEach(() => {
    queryClient.clear()
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('stacks a poster shelf for shows then movies', () => {
    stubViewport({ mobile: false })
    renderRankings()

    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Most watchlisted shows',
      'Most watchlisted movies',
    ])
    const shows = within(shelf('Most watchlisted shows'))
    expect(shows.getByText('1')).toBeInTheDocument()
    expect(shows.getByText('12 watchlists')).toBeInTheDocument()
    expect(shows.getByText('+1')).toBeInTheDocument()
    expect(
      within(shelf('Most watchlisted movies')).getByText(
        'No movies on any watchlist in this range.',
      ),
    ).toBeInTheDocument()
  })

  it('shows ranked rows in list view on desktop', () => {
    localStorage.setItem('pulsarr-rankings-view', 'list')
    stubViewport({ mobile: false })
    renderRankings()

    expect(
      screen.queryByRole('button', { name: 'Next' }),
    ).not.toBeInTheDocument()
    expect(
      within(shelf('Most watchlisted shows')).getByRole('button', {
        name: /Severance/,
      }),
    ).toBeInTheDocument()
  })

  it('keeps phones on the poster shelf', () => {
    localStorage.setItem('pulsarr-rankings-view', 'list')
    stubViewport({ mobile: true })
    renderRankings()

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})
