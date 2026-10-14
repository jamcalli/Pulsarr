import { Fragment, type ReactNode } from 'react'
import { BusyLabel } from '@/components/busy-label'
import { CardHeaderSkeleton } from '@/components/card-header-skeleton'
import { CardTitleCount } from '@/components/card-title-count'
import { ErrorAlert } from '@/components/error-alert'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
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
const ACTIONS_CLASS = 'max-md:w-full max-md:*:h-10 max-md:*:flex-1'

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

function ItemShell({ children }: { children: ReactNode }) {
  return (
    <Item role="listitem" className="flex-wrap px-0 max-md:items-start">
      {children}
    </Item>
  )
}

function FriendRows({ accounts }: { accounts: UntrackedUser[] }) {
  const requests = useFriendRequests()

  return (
    <>
      <ErrorAlert message={requests.errorMessage} />
      <ItemGroup role="list" aria-label="Not yet friends" className="gap-0">
        {accounts.map((account, index) => {
          const actions = ACTIONS[account.status] ?? []
          return (
            <Fragment key={account.uuid}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <ItemShell>
                <ItemMedia>
                  <UserAvatar name={account.username} avatar={account.avatar} />
                </ItemMedia>
                <ItemContent className={CONTENT_CLASS}>
                  <ItemTitle className="break-all">
                    {account.username}
                  </ItemTitle>
                  <ItemDescription className={DESCRIPTION_ROW}>
                    <StatusPill
                      tone={RELATIONSHIP_TONES[account.status]}
                      label={RELATIONSHIP_LABELS[account.status]}
                    />
                    {meaningLine(account)}
                  </ItemDescription>
                </ItemContent>
                {actions.length > 0 && (
                  <ItemActions className={ACTIONS_CLASS}>
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
                  </ItemActions>
                )}
              </ItemShell>
            </Fragment>
          )
        })}
      </ItemGroup>
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
        <ItemGroup role="list" className="gap-0">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => `row-${row}`).map(
            (key, index) => (
              <Fragment key={key}>
                {index > 0 && <ItemSeparator className="my-0" />}
                <ItemShell>
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
                  <ItemActions className={ACTIONS_CLASS}>
                    <Skeleton className="h-8 w-40" />
                  </ItemActions>
                </ItemShell>
              </Fragment>
            ),
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}
