import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTableFooter } from '@/components/data-table/data-table-footer'
import type { PageSize } from '@/components/data-table/page-size'
import { setFormatLocale } from '@/lib/format'

function renderFooter({
  page = 1,
  pageSize = 20,
  total,
  onPageSizeChange = () => undefined,
}: {
  page?: number
  pageSize?: PageSize
  total: number
  onPageSizeChange?: (size: PageSize) => void
}) {
  return render(
    <DataTableFooter
      page={page}
      pageSize={pageSize}
      total={total}
      pageHref={(target) => `?page=${target}`}
      onPageChange={() => undefined}
      onPageSizeChange={onPageSizeChange}
    />,
  )
}

describe('DataTableFooter', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
  })

  it('stays hidden when the smallest page size fits every row', () => {
    const { container } = renderFooter({ total: 10 })

    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the size select with paging disabled when one page fits', () => {
    renderFooter({ total: 15 })

    expect(
      screen.getByRole('combobox', { name: 'Rows per page' }),
    ).toHaveTextContent('20 per page')
    expect(screen.getByLabelText('Go to previous page')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByLabelText('Go to next page')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('reports the picked page size', async () => {
    const user = userEvent.setup()
    const onPageSizeChange = vi.fn()
    renderFooter({ total: 45, onPageSizeChange })

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }))
    await user.click(await screen.findByRole('option', { name: '50 per page' }))

    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })

  it('shows the range of the current page', () => {
    renderFooter({ total: 45 })

    expect(screen.getByText('1 to 20 of 45')).toBeInTheDocument()
  })
})
