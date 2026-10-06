import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopGenresCard } from '@/features/home/components/analytics/top-genres-card'
import type { TopGenres } from '@/features/home/hooks/useTopGenres'
import { setFormatLocale } from '@/lib/format'
import { stubViewport } from '../../../viewport.js'

function topGenres(data: TopGenres['data'] = []): TopGenres {
  return { days: 7, data, isLoading: false, errorMessage: null }
}

function rankedGenres(length: number) {
  return Array.from({ length }, (_, index) => ({
    genre: `genre${index}`,
    count: 100 - index,
  }))
}

describe('TopGenresCard', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
    stubViewport({ mobile: false })
  })

  afterEach(() => {
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('shows the top ten genres and counts the rest', () => {
    render(<TopGenresCard topGenres={topGenres(rankedGenres(14))} />)

    expect(screen.getByText('genre9')).toBeInTheDocument()
    expect(screen.queryByText('genre10')).not.toBeInTheDocument()
    expect(screen.getByText('+4 more genres')).toBeInTheDocument()
  })

  it('hides View all when ten genres or fewer are ranked', () => {
    render(<TopGenresCard topGenres={topGenres(rankedGenres(10))} />)

    expect(screen.getByText('genre9')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View all' }),
    ).not.toBeInTheDocument()
  })

  it('lists every genre in the View all credenza', async () => {
    const user = userEvent.setup()
    render(<TopGenresCard topGenres={topGenres(rankedGenres(14))} />)

    await user.click(screen.getByRole('button', { name: 'View all' }))

    const dialog = await screen.findByRole('dialog', { name: 'Top genres' })
    expect(dialog).toHaveAccessibleDescription('Last 7 days')
    expect(within(dialog).getByText('genre13')).toBeInTheDocument()
    expect(within(dialog).getByText('14')).toBeInTheDocument()
  })

  it('shows the error instead of rows', () => {
    render(
      <TopGenresCard
        topGenres={{ ...topGenres(), errorMessage: 'Top genres failed.' }}
      />,
    )

    expect(screen.getByText('Top genres failed.')).toBeInTheDocument()
  })
})
