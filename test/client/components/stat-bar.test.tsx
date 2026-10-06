import { render, screen } from '@testing-library/react'
import { StatBar, StatBarList } from '@/components/stat-bar'
import { setFormatLocale } from '@/lib/format'

describe('StatBar', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('shows the value and its share of the total', () => {
    render(
      <StatBar label="Movies" value={1234} total={4000} color="chart-movie" />,
    )

    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(screen.getByText('31%')).toBeInTheDocument()
  })

  it('fills the track in the series color', () => {
    const { container } = render(
      <StatBar label="Shows" value={1} total={4} color="chart-show" />,
    )

    const fill = container.querySelector('[data-slot="stat-bar-fill"]')
    expect(fill).toHaveClass('bg-chart-show')
    expect(fill).toHaveStyle({ width: '25%' })
  })

  it('draws no fill and 0% when the total is zero', () => {
    const { container } = render(
      <StatBar label="Shows" value={0} total={0} color="chart-show" />,
    )

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="stat-bar-fill"]'),
    ).not.toBeInTheDocument()
  })

  it('hides the share when showPercent is off', () => {
    render(
      <StatBar
        label="Drama"
        value={3}
        total={4}
        color="chart-single"
        showPercent={false}
      />,
    )

    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })
})

describe('StatBarList', () => {
  it('renders its rows inside the named hover group', () => {
    const { container } = render(
      <StatBarList className="flex flex-col gap-3">
        <StatBar label="Movies" value={1} total={2} color="chart-movie" />
        <StatBar label="Shows" value={1} total={2} color="chart-show" />
      </StatBarList>,
    )

    const list = container.firstElementChild
    expect(list).toHaveClass('group/stat-list', 'flex', 'flex-col', 'gap-3')
    expect(list).toContainElement(screen.getByText('Movies'))
    expect(list).toContainElement(screen.getByText('Shows'))
  })
})
