import { render, screen } from '@testing-library/react'
import { ChartLegend } from '@/components/chart-legend'
import { setFormatLocale } from '@/lib/format'

describe('ChartLegend', () => {
  beforeEach(() => setFormatLocale('en-US'))
  afterEach(() => setFormatLocale(undefined))

  it('lists each series with its swatch color and value', () => {
    const { container } = render(
      <ChartLegend
        items={[
          { label: 'Movies', value: 1200, color: 'chart-movie' },
          { label: 'Shows', value: 0, color: 'chart-show' },
        ]}
      />,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('1,200')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(container.querySelector('.bg-chart-movie')).toBeInTheDocument()
    expect(container.querySelector('.bg-chart-show')).toBeInTheDocument()
  })

  it('shows only labels when items carry no value', () => {
    render(
      <ChartLegend
        items={[
          { label: 'Movies', color: 'chart-movie' },
          { label: 'Shows', color: 'chart-show' },
        ]}
      />,
    )

    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Movies', 'Shows'])
  })
})
