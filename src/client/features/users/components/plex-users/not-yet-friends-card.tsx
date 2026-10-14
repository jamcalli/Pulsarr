import { BusyLabel } from '@/components/busy-label'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CardTitleCount } from '@/components/card-title-count'
import { ErrorAlert } from '@/components/error-alert'
import {
  SeparatedList,
  SeparatedListActions,
  SeparatedListRow,
} from '@/components/separated-list'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import {
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar, UserAvatarSkeleton } from '@/components/user-avatar'
import {
  type FriendAction,
  useFriendRequests,
} from '@/features/users/hooks/plex-users/useFriendRequests'
import {
  RELATIONSHIP_LABELS,
  RELATIONSHIP_MEANING,
  RELATIONSHIP_TONES,
} from '@/features/users/lib/relationship'
import { formatRelative } from '@/lib/format'
import type { paths } from '@/types/api.js'

type UntrackedUser =
  paths['/v1/plex/user-status']['get']['responses'][200]['content']['application/json']['untracked'][number]

const SKELETON_ROWS = 3
const CONTENT_CLASS = 'min-w-0 basis-70'
const DESCRIPTION_ROW = 'flex flex-wrap items-center gap-x-2 gap-y-1'

const ACTIONS: Partial<
  Record<
    UntrackedUser['status'],
    ReadonlyArray<{ action: FriendAction; label: string; busyLabel: string }>
  >
> = {
  server_only: [
    { action: 'send', label: 'Send friend request', busyLabel: 'Sending...' },
  ],
  pending_sent: [
    { action: 'cancel', label: 'Cancel request', busyLabel: 'Cancelling...' },
    { action: 'resend', label: 'Resend request', busyLabel: 'Resending...' },
  ],
}

function meaningLine(account: UntrackedUser): string {
  const meaning = RELATIONSHIP_MEANING[account.status]
  if (account.status !== 'pending_sent' || !account.pendingSince) return meaning
  return `${meaning} Request sent ${formatRelative(new Date(account.pendingSince))}.`
}

function FriendRows({ accounts }: { accounts: UntrackedUser[] }) {
  const requests = useFriendRequests()

  return (
    <>
      <ErrorAlert message={requests.errorMessage} />
      <SeparatedList label="Not yet friends">
        {accounts.map((account) => {
          const actions = ACTIONS[account.status] ?? []
          return (
            <SeparatedListRow key={account.uuid}>
              <ItemMedia>
                <UserAvatar name={account.username} avatar={account.avatar} />
              </ItemMedia>
              <ItemContent className={CONTENT_CLASS}>
                <ItemTitle className="break-all">{account.username}</ItemTitle>
                <ItemDescription className={DESCRIPTION_ROW}>
                  <StatusPill
                    tone={RELATIONSHIP_TONES[account.status]}
                    label={RELATIONSHIP_LABELS[account.status]}
                  />
                  {meaningLine(account)}
                </ItemDescription>
              </ItemContent>
              {actions.length > 0 && (
                <SeparatedListActions>
                  {actions.map(({ action, label, busyLabel }) => {
                    const running =
                      requests.running?.uuid === account.uuid &&
                      requests.running.action === action
                    return (
                      <Button
                        key={action}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={requests.running !== null}
                        onClick={() => requests.run(action, account.uuid)}
                      >
                        <BusyLabel
                          busy={running}
                          label={label}
                          busyLabel={busyLabel}
                        />
                      </Button>
                    )
                  })}
                </SeparatedListActions>
              )}
            </SeparatedListRow>
          )
        })}
      </SeparatedList>
    </>
  )
}

export function NotYetFriendsCard({ accounts }: { accounts: UntrackedUser[] }) {
  const shown = accounts.filter((account) => account.status !== 'managed')
  if (shown.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitleCount title="Not yet friends" count={shown.length} />
        <CardDescription>
          They get settings and a page once they are friends.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FriendRows accounts={shown} />
      </CardContent>
    </Card>
  )
}

export function NotYetFriendsCardSkeleton() {
  return (
    <Card>
      <CardHeaderSkeleton description badge />
      <CardContent>
        <SeparatedList>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => `row-${row}`).map(
            (key) => (
              <SeparatedListRow key={key}>
                <ItemMedia>
                  <UserAvatarSkeleton />
                </ItemMedia>
                <ItemContent className={CONTENT_CLASS}>
                  <Skeleton className="h-4 w-32" />
                  <div className={DESCRIPTION_ROW}>
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-56 max-w-full" />
                  </div>
                </ItemContent>
                <SeparatedListActions>
                  <Skeleton className="h-8 w-40" />
                </SeparatedListActions>
              </SeparatedListRow>
            ),
          )}
        </SeparatedList>
      </CardContent>
    </Card>
  )
}
