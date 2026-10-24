import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverflowList } from '@/features/home/components/overflow-list'
import { stubViewport } from '../../../viewport.js'

const ROWS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven']

function renderList(rows: string[]) {
  return render(
    <OverflowList
      rows={rows}
      summary={(hidden) => `${hidden.length} hidden`}
      title="Everything"
      description="All time"
      renderRows={(visible) => (
        <ul>
          {visible.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      )}
    />,
  )
}

describe('OverflowList', () => {
  beforeEach(() => stubViewport({ mobile: false }))
  afterEach(() => vi.unstubAllGlobals())

  it('shows the first five rows and summarises the rest', () => {
    renderList(ROWS)

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('six')).not.toBeInTheDocument()
    expect(screen.getByText('2 hidden')).toBeInTheDocument()
  })

  it('hides the summary and View all when every row fits', () => {
    renderList(ROWS.slice(0, 5))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText(/hidden/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View all' }),
    ).not.toBeInTheDocument()
  })

  it('opens every row in a credenza from View all', async () => {
    const user = userEvent.setup()
    renderList(ROWS)

    await user.click(screen.getByRole('button', { name: 'View all' }))

    const dialog = await screen.findByRole('dialog', { name: 'Everything' })
    expect(dialog).toHaveAccessibleDescription('All time')
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(7)
    expect(within(dialog).getByText('seven')).toBeInTheDocument()
  })
})
