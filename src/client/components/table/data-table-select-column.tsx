import type { ColumnDef, Row, Table } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'

interface SelectColumnOptions<T> {
  disabled?: (row: Row<T>) => boolean
  headerDisabled?: (table: Table<T>) => boolean
  meta?: ColumnDef<T>['meta']
}

export function createSelectColumn<T>(
  options: SelectColumnOptions<T> = {},
): ColumnDef<T> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        disabled={options.headerDisabled?.(table) ?? false}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        disabled={options.disabled?.(row) ?? !row.getCanSelect()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
    ...(options.meta !== undefined && { meta: options.meta }),
  }
}
