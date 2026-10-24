import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusFilter } from '@/components/status-filter'
import { setFormatLocale } from '@/lib/format'
import { stubViewport } from '../viewport.js'

const options = [
  { value: 'approved', label: 'Approved', count: 412 },
  { value: 'rejected', label: 'Denied', count: 37 },
] as const

describe('StatusFilter', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('draws segments with counts on desktop', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: false })
    const onValueChange = vi.fn()
    render(
      <StatusFilter
        options={options}
        value="all"
        onValueChange={onValueChange}
      />,
    )

    const group = screen.getByRole('group', { name: 'Status' })
    expect(within(group).getByText('412')).toBeInTheDocument()
    await user.click(within(group).getByText('Denied'))
    expect(onValueChange).toHaveBeenCalledWith('rejected')
  })

  it('draws a select with counts on a phone and clears back to all', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: true })
    const onValueChange = vi.fn()
    render(
      <StatusFilter
        options={options}
        value="approved"
        onValueChange={onValueChange}
      />,
    )

    expect(
      screen.queryByRole('group', { name: 'Status' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'All statuses' }))
    expect(
      await screen.findByRole('option', { name: 'Denied (37)' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'All' }))
    expect(onValueChange).toHaveBeenCalledWith('all')
  })
})
