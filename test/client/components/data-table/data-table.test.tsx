import type {
  ColumnDef,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import type { DataTableVariant } from '@/components/data-table/data-table-variant'

interface Row {
  id: number
  name: string
  size: number
}

const rows: Row[] = [
  { id: 1, name: 'Alpha', size: 3 },
  { id: 2, name: 'Beta', size: 1 },
  { id: 3, name: 'Gamma', size: 2 },
]

const columns: ColumnDef<Row>[] = [
  { id: 'name', header: 'Name', accessorFn: (row) => row.name },
  {
    id: 'size',
    header: 'Size',
    accessorFn: (row) => row.size,
  },
  {
    id: 'note',
    header: 'Note',
    enableSorting: false,
    cell: () => 'n/a',
  },
]

function Harness({
  initialSelection = {},
  onSort = () => undefined,
  onRowClick,
  frozen,
}: {
  initialSelection?: RowSelectionState
  onSort?: (next: SortingState) => void
  onRowClick?: (row: Row) => void
  frozen?: boolean
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'name', desc: false },
  ])
  const [selection, setSelection] = useState(initialSelection)
  return (
    <>
      <DataTable
        label="Things"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        rowName={(row) => row.name}
        sorting={sorting}
        onSortingChange={(next) => {
          onSort(next)
          setSorting(next)
        }}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        onRowClick={onRowClick}
        frozen={frozen}
      />
      <output>
        {Object.keys(selection)
          .filter((id) => selection[id])
          .join(',')}
      </output>
    </>
  )
}

describe('DataTable', () => {
  it('marks only the active column sorted and flips it on click', async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    render(<Harness onSort={onSort} />)

    const name = screen.getByRole('columnheader', { name: 'Name' })
    expect(name).toHaveAttribute('aria-sort', 'ascending')
    expect(
      screen.getByRole('columnheader', { name: 'Size' }),
    ).not.toHaveAttribute('aria-sort')
    expect(
      screen.queryByRole('button', { name: 'Note' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Name' }))
    expect(onSort).toHaveBeenLastCalledWith([{ id: 'name', desc: true }])
    expect(name).toHaveAttribute('aria-sort', 'descending')

    await user.click(screen.getByRole('button', { name: 'Size' }))
    expect(onSort).toHaveBeenLastCalledWith([{ id: 'size', desc: false }])
  })

  it('selects rows one at a time and the page from the header', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const all = screen.getByRole('checkbox', {
      name: 'Select all on this page',
    })

    await user.click(screen.getByRole('checkbox', { name: 'Select Beta' }))
    expect(screen.getByRole('status')).toHaveTextContent('2')
    expect(all).toHaveAttribute('aria-checked', 'mixed')
    expect(screen.getByRole('row', { name: /Beta/ })).toHaveAttribute(
      'data-state',
      'selected',
    )

    await user.click(all)
    expect(screen.getByRole('status')).toHaveTextContent('1,2,3')
    expect(all).toHaveAttribute('aria-checked', 'true')

    await user.click(all)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('opens a row on click but not from its checkbox', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(<Harness onRowClick={onRowClick} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select Gamma' }))
    expect(onRowClick).not.toHaveBeenCalled()

    await user.click(screen.getByText('Gamma'))
    expect(onRowClick).toHaveBeenCalledWith(rows[2])
  })

  it('freezes selection and row clicks while frozen', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(<Harness onRowClick={onRowClick} frozen />)

    expect(screen.getByRole('table', { name: 'Things' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(
      screen.getByRole('checkbox', { name: 'Select all on this page' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('checkbox', { name: 'Select Gamma' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    await user.click(screen.getByText('Gamma'))
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

function ExpandHarness({
  frozen,
  canExpand,
  variant,
}: {
  frozen?: boolean
  canExpand?: (row: Row) => boolean
  variant?: DataTableVariant
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  return (
    <DataTable
      label="Things"
      columns={columns}
      data={rows}
      getRowId={(row) => String(row.id)}
      rowName={(row) => row.name}
      sorting={[]}
      onSortingChange={() => undefined}
      rowSelection={{}}
      onRowSelectionChange={() => undefined}
      renderExpanded={(row) => `Detail of ${row.name}`}
      expandedLabel={(row) => `${row.name} details`}
      expandedId={expandedId}
      onExpandedChange={setExpandedId}
      canExpand={canExpand}
      frozen={frozen}
      variant={variant}
    />
  )
}

describe('DataTable row expansion', () => {
  it('opens a row on click and closes it on a second click', async () => {
    const user = userEvent.setup()
    render(<ExpandHarness />)
    const toggle = screen.getByRole('button', { name: 'Beta details' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).not.toHaveAttribute('aria-controls')

    await user.click(screen.getByText('Beta'))
    const region = screen.getByRole('region', { name: 'Beta details' })
    expect(region).toHaveTextContent('Detail of Beta')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', region.id)

    await user.click(screen.getByText('Beta'))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps one row open at a time', async () => {
    const user = userEvent.setup()
    render(<ExpandHarness />)

    await user.click(screen.getByText('Alpha'))
    await user.click(screen.getByText('Gamma'))
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(
      screen.getByRole('region', { name: 'Gamma details' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Alpha details' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup()
    render(<ExpandHarness />)
    const toggle = screen.getByRole('button', { name: 'Alpha details' })

    toggle.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('region', { name: 'Alpha details' }),
    ).toBeInTheDocument()

    await user.keyboard(' ')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('does not toggle from the selection checkbox or while frozen', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExpandHarness />)

    await user.click(screen.getByRole('checkbox', { name: 'Select Alpha' }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    rerender(<ExpandHarness frozen />)
    expect(screen.getByRole('button', { name: 'Alpha details' })).toBeDisabled()
    await user.click(screen.getByText('Alpha'))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('gives only the rows canExpand accepts a toggle and a click', async () => {
    const user = userEvent.setup()
    render(<ExpandHarness canExpand={(row) => row.size > 1} />)

    expect(
      screen.queryByRole('button', { name: 'Beta details' }),
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('row', { name: /Beta/ })).getAllByRole('cell'),
    ).toHaveLength(5)
    await user.click(screen.getByText('Beta'))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    await user.click(screen.getByText('Gamma'))
    expect(
      screen.getByRole('region', { name: 'Gamma details' }),
    ).toBeInTheDocument()
  })

  it('scrolls the rows inside the card under a pinned header', () => {
    const scrollRef = createRef<HTMLDivElement>()
    render(
      <DataTable
        label="Things"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        sorting={[]}
        onSortingChange={() => undefined}
        scroll={{ ref: scrollRef, className: 'h-40' }}
      />,
    )
    const table = screen.getByRole('table', { name: 'Things' })
    expect(scrollRef.current).toContainElement(table)
    expect(scrollRef.current).toHaveClass('overflow-y-auto')
    expect(table.querySelector('thead')).toHaveClass('sticky')
    expect(scrollRef.current?.closest('[data-slot="card"]')).toHaveClass('h-40')
  })

  it('renders no toggle column without renderExpanded', () => {
    render(<Harness />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
    expect(
      screen.queryByRole('button', { expanded: false }),
    ).not.toBeInTheDocument()
  })

  it('rejects a row click handler alongside expansion', () => {
    render(
      // @ts-expect-error onRowClick and renderExpanded are mutually exclusive
      <DataTable
        label="Things"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        rowName={(row) => row.name}
        sorting={[]}
        onSortingChange={() => undefined}
        rowSelection={{}}
        onRowSelectionChange={() => undefined}
        onRowClick={() => undefined}
        renderExpanded={() => null}
        expandedLabel={(row) => row.name}
        expandedId={null}
        onExpandedChange={() => undefined}
      />,
    )
    expect(screen.getByRole('table', { name: 'Things' })).toBeInTheDocument()
  })

  it('renders no checkbox column without a selection', () => {
    render(
      <DataTable
        label="Things"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        sorting={[]}
        onSortingChange={() => undefined}
      />,
    )

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length)
  })
})

describe('DataTable flat variant', () => {
  it('renders inside a framed card by default', () => {
    render(<ExpandHarness />)
    const table = screen.getByRole('table', { name: 'Things' })
    expect(table.closest('[data-slot="card"]')).toBeInTheDocument()
  })

  it('drops the card frame but keeps the header, rows and expansion', async () => {
    const user = userEvent.setup()
    render(<ExpandHarness variant="flat" />)
    const table = screen.getByRole('table', { name: 'Things' })
    expect(table.closest('[data-slot="card"]')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1)

    await user.click(screen.getByText('Beta'))
    expect(
      screen.getByRole('region', { name: 'Beta details' }),
    ).toHaveTextContent('Detail of Beta')
  })

  it('sizes the flat wrapper from the scroll class', () => {
    const scrollRef = createRef<HTMLDivElement>()
    const { container } = render(
      <DataTable
        label="Things"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        sorting={[]}
        onSortingChange={() => undefined}
        variant="flat"
        scroll={{ ref: scrollRef, className: 'h-40' }}
      />,
    )
    expect(scrollRef.current).toHaveClass('overflow-y-auto')
    expect(container.firstElementChild).toHaveClass('h-40')
  })
})
