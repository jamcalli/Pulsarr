import type {
  ColumnDef,
  RowSelectionState,
  SortingState,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DataTable } from '@/components/data-table/data-table'

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
