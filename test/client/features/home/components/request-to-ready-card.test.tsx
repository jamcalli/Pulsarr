import { render, screen } from '@testing-library/react'
import { RequestToReadyCard } from '@/features/home/components/analytics/request-to-ready-card'
import { setFormatLocale } from '@/lib/format'

const MINUTE = 1 / (24 * 60)

const movie = {
  content_type: 'movie',
  avg_days: 14 * MINUTE,
  min_days: 3 * MINUTE,
  max_days: 42 * MINUTE,
  median_days: 12 * MINUTE,
  p90_days: 30 * MINUTE,
  count: 84,
  pending: 0,
}

const show = {
  content_type: 'show',
  avg_days: 22 * MINUTE,
  min_days: 5 * MINUTE,
  max_days: 30 * MINUTE,
  median_days: 20 * MINUTE,
  p90_days: 28 * MINUTE,
  count: 16,
  pending: 0,
}

describe('RequestToReadyCard', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('compares the two types when both have data', () => {
    render(<RequestToReadyCard times={[movie, show]} />)

    expect(
      screen.getByText('Movies are ready about 8 min sooner than shows.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Average 14 min, 3 to 42 min, 84 items'),
    ).toBeInTheDocument()
  })

  it('shows only the measured type and no comparison with one type', () => {
    render(<RequestToReadyCard times={[movie, { ...show, count: 0 }]} />)

    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.queryByText('Shows')).not.toBeInTheDocument()
    expect(screen.queryByText(/sooner than/)).not.toBeInTheDocument()
  })

  it('draws no rows and no headline with no measured types', () => {
    render(<RequestToReadyCard times={[]} />)

    expect(screen.queryByText('Movies')).not.toBeInTheDocument()
    expect(screen.queryByText('Shows')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d/)).not.toBeInTheDocument()
  })
})
