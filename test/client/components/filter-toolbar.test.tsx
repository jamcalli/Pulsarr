import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import {
  FilterToolbar,
  FilterToolbarSkeleton,
} from '@/components/filter-toolbar'
import { toolbarFilter } from '@/lib/filter-toolbar'
import { setFormatLocale } from '@/lib/format'
import { stubViewport } from '../viewport.js'

const syncFilter = toolbarFilter({
  label: 'Sync',
  value: null,
  options: [{ value: 'on', label: 'Syncing' }],
  onValueChange: () => undefined,
  width: 'w-36',
})

function renderToolbar({
  withSync = false,
  ...props
}: Partial<ComponentProps<typeof FilterToolbar>> & {
  withSync?: boolean
} = {}) {
  const onType = vi.fn()
  const onSearch = vi.fn()
  const onClear = vi.fn()
  render(
    <FilterToolbar
      search={{ label: 'Search titles', value: '', onValueChange: onSearch }}
      filters={[
        toolbarFilter({
          label: 'Content type',
          value: null,
          options: [
            { value: 'movie', label: 'Movies' },
            { value: 'show', label: 'Shows' },
          ],
          onValueChange: onType,
          width: 'w-38',
        }),
        ...(withSync ? [syncFilter] : []),
      ]}
      filterCount={0}
      filtered={false}
      onClear={onClear}
      total={12}
      noun="request"
      {...props}
    />,
  )
  return { onType, onSearch, onClear }
}

describe('FilterToolbar', () => {
  beforeEach(() => {
    setFormatLocale('en-US')
  })

  afterEach(() => {
    setFormatLocale(undefined)
    vi.unstubAllGlobals()
  })

  it('draws the search and each filter select in one row on desktop', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: false })
    const { onType } = renderToolbar()

    expect(
      screen.getByRole('searchbox', { name: 'Search titles' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Filters' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Content type' }))
    await user.click(await screen.findByRole('option', { name: 'Shows' }))
    expect(onType).toHaveBeenCalledWith('show')
  })

  it('offers Clear filters only while a filter is set', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: false })
    const { onClear } = renderToolbar({ filtered: true })

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('keeps a lone filter inline on a phone with no drawer', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: true })
    const { onType } = renderToolbar()

    expect(
      screen.queryByRole('button', { name: /Filters/ }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Content type' }))
    await user.click(await screen.findByRole('option', { name: 'Shows' }))
    expect(onType).toHaveBeenCalledWith('show')
  })

  it('moves two or more filters into a drawer on a phone, closed by the result count', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: true })
    renderToolbar({ withSync: true, filterCount: 1, filtered: true })

    expect(
      screen.queryByRole('combobox', { name: 'Content type' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('combobox', { name: 'Content type' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('combobox', { name: 'Sync' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Show 12 requests' }),
    ).toBeInTheDocument()
  })

  it('reads Show results when nothing matches', async () => {
    const user = userEvent.setup()
    stubViewport({ mobile: true })
    renderToolbar({ withSync: true, total: 0 })

    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(
      await screen.findByRole('button', { name: 'Show results' }),
    ).toBeInTheDocument()
  })
})

describe('FilterToolbarSkeleton', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('draws one select placeholder per filter at its loaded width on desktop', () => {
    stubViewport({ mobile: false })
    const { container } = render(
      <FilterToolbarSkeleton widths={{ type: 'w-38', trigger: 'w-42' }} />,
    )

    expect(container.querySelectorAll('.w-38')).toHaveLength(1)
    expect(container.querySelectorAll('.w-42')).toHaveLength(1)
  })

  it('draws the search and the Filters button placeholder on a phone', () => {
    stubViewport({ mobile: true })
    const { container } = render(
      <FilterToolbarSkeleton widths={{ type: 'w-38', sync: 'w-36' }} />,
    )

    expect(container.querySelector('.w-38')).toBeNull()
    expect(container.querySelector('.w-24')).not.toBeNull()
  })

  it('draws a lone filter placeholder inline on a phone', () => {
    stubViewport({ mobile: true })
    const { container } = render(
      <FilterToolbarSkeleton widths={{ type: 'w-38' }} />,
    )

    expect(container.querySelector('.w-38')).not.toBeNull()
    expect(container.querySelector('.w-24')).toBeNull()
  })
})
