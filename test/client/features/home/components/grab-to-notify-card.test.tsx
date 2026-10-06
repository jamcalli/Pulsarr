import { render, screen } from '@testing-library/react'
import { GrabToNotifyCard } from '@/features/home/components/analytics/grab-to-notify-card'
import { setFormatLocale } from '@/lib/format'

const MINUTE = 1 / (24 * 60)

const movie = {
  content_type: 'movie',
  avg_days: 14 * MINUTE,
  min_days: 3 * MINUTE,
  max_days: 42 * MINUTE,
  count: 84,
}

const show = {
  content_type: 'show',
  avg_days: 22 * MINUTE,
  min_days: 5 * MINUTE,
  max_days: 30 * MINUTE,
  count: 16,
}

describe('GrabToNotifyCard', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('compares the two types when both have data', () => {
    render(<GrabToNotifyCard times={[movie, show]} />)

    expect(
      screen.getByText('Movies are ready about 8 min sooner than shows.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Average 14 min, 3 to 42 min, 84 items'),
    ).toBeInTheDocument()
  })

  it('shows only the measured type and no comparison with one type', () => {
    render(<GrabToNotifyCard times={[movie, { ...show, count: 0 }]} />)

    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.queryByText('Shows')).not.toBeInTheDocument()
    expect(screen.queryByText(/sooner than/)).not.toBeInTheDocument()
  })

  it('shows the empty state with no measured types', () => {
    render(<GrabToNotifyCard times={[]} />)

    expect(
      screen.getByText('Nothing was grabbed in this range.'),
    ).toBeInTheDocument()
  })
})
