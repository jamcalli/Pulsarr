import { useMemo } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { ExclusionUsers } from '@/features/library/components/exclusions/exclusion-users'
import {
  EXCLUSIONS_COLUMN_CLASSES,
  exclusionsColumns,
} from '@/features/library/components/exclusions/exclusions-columns'
import type { ExclusionsPage } from '@/features/library/hooks/exclusions/useExclusionsPage'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']

interface ExclusionsTableProps {
  page: ExclusionsPage
  rows: ExclusionItem[]
}

export function ExclusionsTable({ page, rows }: ExclusionsTableProps) {
  const { sort, dir } = page.state
  const { locked, openSingle } = page
  const columns = useMemo(
    () => exclusionsColumns(locked, openSingle),
    [locked, openSingle],
  )

  return (
    <DataTable
      label="Watchlist titles"
      columns={columns}
      columnClasses={EXCLUSIONS_COLUMN_CLASSES}
      variant="flat"
      data={rows}
      getRowId={(row) => row.key}
      rowName={(row) => row.title}
      sorting={[{ id: sort, desc: dir === 'desc' }]}
      onSortingChange={(next) => {
        const [first] = next
        const key = page.sortKeys.find((option) => option === first?.id)
        if (first && key)
          page.update({ sort: key, dir: first.desc ? 'desc' : 'asc' })
      }}
      rowSelection={page.selection}
      onRowSelectionChange={page.setSelection}
      renderExpanded={(row) => (
        <ExclusionUsers item={row} locked={locked} onAction={openSingle} />
      )}
      expandedLabel={(row) => `${row.title} watchlisters`}
      expandedId={page.expandedId}
      onExpandedChange={page.setExpandedId}
      canExpand={(row) => row.users.length > 0}
      frozen={page.stale || locked}
    />
  )
}
