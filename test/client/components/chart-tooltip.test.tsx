import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import {
  ChartTooltip,
  ChartTooltipTrigger,
  createChartTooltipHandle,
  SharedChartTooltip,
} from '@/components/chart-tooltip'
import { stubViewport } from '../viewport.js'

describe('ChartTooltip', () => {
  it('shows the value, label and detail when the mark gets keyboard focus', async () => {
    render(
      <ChartTooltip
        label="Movies"
        value="1,200"
        detail="60%"
        color="chart-movie"
        render={<button type="button" aria-label="Movies: 1,200" />}
      />,
    )

    expect(screen.queryByText('1,200')).not.toBeInTheDocument()

    await userEvent.tab()

    expect(screen.getByRole('button', { name: 'Movies: 1,200' })).toHaveFocus()
    expect(await screen.findByText('1,200')).toHaveClass('font-bold')
    expect(screen.getByText('Movies')).toHaveClass('text-muted-foreground')
    expect(screen.getByText('60%')).toHaveClass('text-muted-foreground')
  })

  it('keys the row with the series color when one is given', async () => {
    render(
      <ChartTooltip
        label="Shows"
        value="40"
        color="chart-show"
        render={<button type="button" aria-label="Shows: 40" />}
      />,
    )

    await userEvent.tab()

    const value = await screen.findByText('40')
    expect(value.parentElement?.querySelector('.bg-chart-show')).toBeTruthy()
  })
})

describe('ChartTooltip on a coarse pointer', () => {
  beforeEach(() => {
    stubViewport({ mobile: true, coarsePointer: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('toggles the value and label when the mark is tapped', async () => {
    render(
      <ChartTooltip
        label="Movies"
        value="1,200"
        render={<button type="button" aria-label="Movies: 1,200" />}
      />,
    )

    const mark = screen.getByRole('button', { name: 'Movies: 1,200' })
    await userEvent.click(mark)

    expect(
      (await screen.findByText('1,200')).closest(
        '[data-slot="popover-content"]',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Movies')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.click(mark)

    await waitFor(() => {
      expect(screen.queryByText('1,200')).not.toBeInTheDocument()
    })
  })

  it('shows the tapped mark payload on a shared handle', async () => {
    function SharedMarks() {
      const [handle] = useState(createChartTooltipHandle)
      return (
        <>
          <ChartTooltipTrigger
            handle={handle}
            payload={{ label: 'Movies', value: '12' }}
            render={<button type="button" aria-label="Movies: 12" />}
          />
          <ChartTooltipTrigger
            handle={handle}
            payload={{ label: 'Shows', value: '34' }}
            render={<button type="button" aria-label="Shows: 34" />}
          />
          <SharedChartTooltip handle={handle} />
        </>
      )
    }

    render(<SharedMarks />)

    await userEvent.click(screen.getByRole('button', { name: 'Movies: 12' }))
    expect(await screen.findByText('12')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Shows: 34' }))
    expect(await screen.findByText('34')).toBeInTheDocument()
    expect(screen.getByText('Shows')).toBeInTheDocument()
  })
})
