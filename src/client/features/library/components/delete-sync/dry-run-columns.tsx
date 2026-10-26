import type { ColumnDef } from '@tanstack/react-table'
import type { DryRunItemRow } from '@/features/library/lib/delete-sync/dry-run-items'

/** Column ids match the sort keys, and phones stack instance and GUID under the title. */
export const DRY_RUN_COLUMNS: ColumnDef<DryRunItemRow>[] = [
  {
    id: 'title',
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{row.original.title}</span>
        <span className="text-muted-foreground md:hidden">
          {row.original.instance}
        </span>
        <span className="font-mono text-xs text-muted-foreground md:hidden">
          {row.original.guid}
        </span>
      </div>
    ),
  },
  {
    id: 'instance',
    accessorKey: 'instance',
    header: 'Instance',
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.instance}</span>
    ),
  },
  {
    id: 'guid',
    accessorKey: 'guid',
    header: 'GUID',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.original.guid}
      </span>
    ),
  },
]

export const DRY_RUN_COLUMN_CLASSES: Partial<Record<string, string>> = {
  title: 'whitespace-normal wrap-anywhere',
  instance: 'max-md:hidden',
  guid: 'whitespace-normal wrap-anywhere max-md:hidden',
}
