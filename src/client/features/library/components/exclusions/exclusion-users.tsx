import { ResultsTableHeader } from '@/components/settings/action-results'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { SingleTarget } from '@/features/library/hooks/exclusions/useExclusionActions'
import { useUserDirectory } from '@/hooks/useUserDirectory'
import { formatDate } from '@/lib/format'
import { REQUEST_STATUS_LABELS } from '@/lib/request-labels'
import type { components } from '@/types/api.js'

type ExclusionItem = components['schemas']['WatchlistExclusionItem']
type ExclusionUser = components['schemas']['WatchlistExclusionUser']

const USER_COLUMNS = [
  { label: 'User' },
  { label: 'Status' },
  { label: 'Added' },
  { label: 'Exclusion' },
]

interface ExclusionUsersProps {
  item: ExclusionItem
  locked: boolean
  onAction: (target: SingleTarget) => void
}

function UserButton({
  item,
  user,
  locked,
  onAction,
}: ExclusionUsersProps & { user: ExclusionUser }) {
  const own = user.ownExclusion
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={locked}
      onClick={() =>
        onAction(
          own
            ? { kind: 'removeUser', item, user, id: own.id }
            : { kind: 'excludeUser', item, user },
        )
      }
    >
      {own ? 'Remove' : 'Exclude'}
    </Button>
  )
}

export function ExclusionUsers({
  item,
  locked,
  onAction,
}: ExclusionUsersProps) {
  const { lookup } = useUserDirectory()

  return (
    <div className="flex flex-col gap-3">
      {item.globalExclusion && (
        <p className="text-muted-foreground">
          Excluded for everyone. Per-user exclusions below still apply if the
          global one is removed.
        </p>
      )}
      <Table className="text-xs">
        <ResultsTableHeader columns={USER_COLUMNS} />
        <TableBody>
          {item.users.map((user) => {
            const { name } = lookup(user.userName)
            const status = user.status ? (
              REQUEST_STATUS_LABELS[user.status]
            ) : (
              <span className="text-muted-foreground">Not on a watchlist</span>
            )
            return (
              <TableRow key={user.userId}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{name}</span>
                    {name !== user.userName && (
                      <span className="text-muted-foreground">
                        {user.userName}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{status}</TableCell>
                <TableCell>
                  {user.added ? formatDate(new Date(user.added)) : null}
                </TableCell>
                <TableCell>
                  <UserButton
                    item={item}
                    user={user}
                    locked={locked}
                    onAction={onAction}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
