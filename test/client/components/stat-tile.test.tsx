import { render } from '@testing-library/react'
import { StatTileSkeleton } from '@/components/stat-tile'

describe('StatTileSkeleton', () => {
  it('draws a label, value and description line by default', () => {
    const { container } = render(<StatTileSkeleton />)

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
  })

  it('puts the children in place of the value and keeps the description line', () => {
    const { container, getByTestId } = render(
      <StatTileSkeleton>
        <div data-testid="chart" />
      </StatTileSkeleton>,
    )

    const tile = container.firstElementChild
    expect(tile?.children[1]).toBe(getByTestId('chart'))
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
  })
})
