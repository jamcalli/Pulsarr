import { render, screen } from '@testing-library/react'
import { StackedBar } from '@/components/stacked-bar'
import { setFormatLocale } from '@/lib/format'

function segmentsOf(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[data-slot="stacked-bar-segment"]',
    ),
  ]
}

describe('StackedBar', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('separates segments with one ink border instead of a gap', () => {
    const { container } = render(
      <StackedBar
        segments={[
          { label: 'Movies', value: 60, color: 'chart-movie' },
          { label: 'Shows', value: 40, color: 'chart-show' },
        ]}
      />,
    )

    const [first, second] = segmentsOf(container)
    expect(first).toHaveClass('border-2', 'border-border', 'bg-chart-movie')
    expect(first).not.toHaveClass('border-l-0')
    expect(second).toHaveClass('border-l-0', 'rounded-r-sm', 'bg-chart-show')
    expect(first).toHaveStyle({ width: '60%' })
  })

  it('labels a segment inside the bar only when it is at least 8% wide', () => {
    const { container } = render(
      <StackedBar
        segments={[
          { label: 'Requested', value: 93, color: 'chart-requested' },
          { label: 'Grabbed', value: 7, color: 'chart-grabbed' },
        ]}
      />,
    )

    const [wide, narrow] = segmentsOf(container)
    expect(wide).toHaveTextContent('93%')
    expect(narrow).toHaveTextContent('')
  })

  it('shows a legend with values for two or more segments', () => {
    render(
      <StackedBar
        segments={[
          { label: 'Movies', value: 1200, color: 'chart-movie' },
          { label: 'Shows', value: 0, color: 'chart-show' },
        ]}
      />,
    )

    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.getByText('1,200')).toBeInTheDocument()
    expect(screen.getByText('Shows')).toBeInTheDocument()
  })

  it('omits the legend for a single segment', () => {
    render(
      <StackedBar
        segments={[{ label: 'Movies', value: 5, color: 'chart-movie' }]}
      />,
    )

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('omits the legend when showLegend is off', () => {
    render(
      <StackedBar
        showLegend={false}
        segments={[
          { label: 'Movies', value: 5, color: 'chart-movie' },
          { label: 'Shows', value: 5, color: 'chart-show' },
        ]}
      />,
    )

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
