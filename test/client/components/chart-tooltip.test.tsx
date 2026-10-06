import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChartTooltip } from '@/components/chart-tooltip'

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
