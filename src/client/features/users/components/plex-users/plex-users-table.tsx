import { useNavigate } from 'react-router-dom'
import { DataTable } from '@/components/data-table/data-table'
import {
  USERS_COLUMN_CLASSES,
  USERS_COLUMNS,
} from '@/features/users/components/plex-users/plex-users-columns'
import type { PlexUsersPage } from '@/features/users/hooks/plex-users/usePlexUsersPage'
import type { PlexUserRow } from '@/features/users/lib/plex-users/user-rows'
import { userPageHref } from '@/lib/navigation'
import { displayName } from '@/lib/user-naming'

interface PlexUsersTableProps {
  page: PlexUsersPage
  rows: PlexUserRow[]
}

export function PlexUsersTable({ page, rows }: PlexUsersTableProps) {
  const navigate = useNavigate()
  const { sort, dir } = page.state

  return (
    <DataTable
      label="Plex users"
      columns={USERS_COLUMNS}
      columnClasses={USERS_COLUMN_CLASSES}
      data={rows}
      getRowId={(row) => String(row.user.id)}
      rowName={(row) => displayName(row.user)}
      sorting={[{ id: sort, desc: dir === 'desc' }]}
      onSortingChange={(next) => {
        const [first] = next
        const key = page.sortKeys.find((option) => option === first?.id)
        if (first && key)
          page.update({ sort: key, dir: first.desc ? 'desc' : 'asc' })
      }}
      rowSelection={page.selection}
      onRowSelectionChange={page.setSelection}
      onRowClick={(row) => navigate(userPageHref(row.user.id))}
    />
  )
}
