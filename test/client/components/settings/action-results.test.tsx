import { render, screen } from '@testing-library/react'
import { ActionResults } from '@/components/settings/action-results'
import { formatTime } from '@/lib/format'

const ranAt = new Date(2026, 9, 4, 14, 5).getTime()
const time = formatTime(ranAt)

function stats(tagged: number, failed: number) {
  return [
    { label: 'Tagged', value: tagged },
    { label: 'Failed', value: failed, destructive: true },
  ]
}

describe('ActionResults', () => {
  it('renders the run time and each column header once', () => {
    render(
      <ActionResults
        ranAt={ranAt}
        rows={[
          { target: 'Sonarr', stats: stats(12, 0) },
          { target: 'Radarr', stats: stats(4, 0) },
        ]}
      />,
    )

    expect(screen.getByText(`Ran at ${time}`)).toBeInTheDocument()
    expect(
      screen.getAllByRole('columnheader', { name: 'Tagged' }),
    ).toHaveLength(1)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('Sonarr12')
    expect(rows[2]).toHaveTextContent('Radarr4')
  })

  it('hides the failed column when nothing failed', () => {
    render(
      <ActionResults
        ranAt={ranAt}
        rows={[
          { target: 'Sonarr', stats: stats(1, 0) },
          { target: 'Radarr', stats: stats(1, 0) },
        ]}
      />,
    )

    expect(
      screen.queryByRole('columnheader', { name: 'Failed' }),
    ).not.toBeInTheDocument()
  })

  it('shows the failed column with destructive styling when one target failed', () => {
    render(
      <ActionResults
        ranAt={ranAt}
        rows={[
          { target: 'Sonarr', stats: stats(1, 3) },
          { target: 'Radarr', stats: stats(2, 0) },
        ]}
      />,
    )

    expect(
      screen.getByRole('columnheader', { name: 'Failed' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '3' })).toHaveClass(
      'text-destructive',
      'font-bold',
    )
  })

  it('mutes zero values', () => {
    render(
      <ActionResults
        ranAt={ranAt}
        rows={[{ target: 'Sonarr', stats: stats(0, 2) }]}
      />,
    )

    expect(screen.getByRole('cell', { name: '0' })).toHaveClass(
      'text-muted-foreground',
    )
    expect(screen.getByRole('cell', { name: '2' })).not.toHaveClass(
      'text-muted-foreground',
    )
  })
})
