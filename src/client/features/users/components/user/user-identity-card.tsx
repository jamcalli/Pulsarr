import { useState } from 'react'
import { StatusPill } from '@/components/status-pill'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar, UserAvatarSkeleton } from '@/components/user-avatar'
import { GuardedRemoval } from '@/features/users/components/user/guarded-removal'
import { useRemoveFriend } from '@/features/users/hooks/user/useRemoveFriend'
import {
  RELATIONSHIP_LABELS,
  RELATIONSHIP_MEANING,
  RELATIONSHIP_TONES,
} from '@/features/users/lib/relationship'
import { formatDateTime } from '@/lib/format'
import type { components } from '@/types/api.js'

type User = components['schemas']['UserWithFriendStatus']

const IDENTITY_ROW = 'flex flex-wrap items-start gap-4'
const IDENTITY_COLUMN = 'flex min-w-0 flex-1 flex-col items-start gap-2'
const NAME_ROW = 'flex flex-wrap items-center gap-2'

interface UserIdentityCardProps {
  user: User
  name: string
  dirty: boolean
}

function RemoveFriend({ user, name, dirty }: UserIdentityCardProps) {
  const [open, setOpen] = useState(false)
  const removal = useRemoveFriend()
  const uuid = user.plex_uuid
  if (!uuid) return null

  return (
    <GuardedRemoval
      dirty={dirty}
      open={open}
      onOpenChange={setOpen}
      onOpen={removal.reset}
      label="Remove friend"
      title={`Remove ${name} as a friend?`}
      description="Their Pulsarr record, watchlist and quotas are deleted at the next sync."
      pending={removal.pending}
      errorMessage={removal.errorMessage}
      onConfirm={() => removal.remove(uuid)}
    />
  )
}

export function UserIdentityCard({ user, name, dirty }: UserIdentityCardProps) {
  const status = user.friendStatus
  const removable = status === 'friend' || status === 'friend_only'
  const dates = `Added ${formatDateTime(new Date(user.created_at))}, updated ${formatDateTime(new Date(user.updated_at))}`

  return (
    <Card>
      <CardContent className={IDENTITY_ROW}>
        <UserAvatar name={name} avatar={user.avatar} size="xl" />
        <div className={IDENTITY_COLUMN}>
          <div className={NAME_ROW}>
            <span className="font-heading text-xl font-bold break-words">
              {name}
            </span>
            {status && (
              <StatusPill
                tone={RELATIONSHIP_TONES[status]}
                label={RELATIONSHIP_LABELS[status]}
              />
            )}
          </div>
          {status && <p>{RELATIONSHIP_MEANING[status]}</p>}
          <p className="text-sm text-muted-foreground">{dates}</p>
          {removable && <RemoveFriend user={user} name={name} dirty={dirty} />}
        </div>
      </CardContent>
    </Card>
  )
}

export function UserIdentityCardSkeleton() {
  return (
    <Card>
      <CardContent className={IDENTITY_ROW}>
        <UserAvatarSkeleton size="xl" />
        <div className={IDENTITY_COLUMN}>
          <div className={NAME_ROW}>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-5 w-80 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <Skeleton className="h-8 w-32" />
        </div>
      </CardContent>
    </Card>
  )
}
