import type { PlexFriendStatus } from '@root/schemas/plex/user-status.schema'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Credenza,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
} from '@/components/ui/credenza'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { apiClient } from '@/lib/apiClient'

interface FriendStatusBadgeProps {
  status: PlexFriendStatus
  username: string
  avatar?: string | null
  uuid: string
  pendingSince?: string | null
  onStatusChange: () => void
}

const statusConfig: Record<
  PlexFriendStatus,
  { text: string; variant: 'default' | 'warn' | 'neutral'; tooltip: string }
> = {
  friend: {
    text: 'Friend',
    variant: 'default',
    tooltip: 'On your friends list. Click to remove.',
  },
  server_only: {
    text: 'No Friend',
    variant: 'warn',
    tooltip: 'On your server but not your friend. Click to send a request.',
  },
  pending_sent: {
    text: 'Pending',
    variant: 'neutral',
    tooltip: 'Friend request sent. Click for options.',
  },
  pending_received: {
    text: 'Incoming',
    variant: 'neutral',
    tooltip: 'This user sent you a friend request. Accept it in Plex.',
  },
  friend_only: {
    text: 'No Server',
    variant: 'neutral',
    tooltip: 'On your friends list but not shared to your server.',
  },
}

export function FriendStatusBadge({
  status,
  username,
  avatar,
  uuid,
  pendingSince,
  onStatusChange,
}: FriendStatusBadgeProps) {
  const [credenzaOpen, setCredenzaOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    'cancel' | 'resend' | null
  >(null)
  const config = statusConfig[status]

  const badgeTooltip = (children: React.ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{config.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <>
      {(status === 'friend' || status === 'server_only') &&
        badgeTooltip(
          <Badge
            variant={config.variant}
            className="cursor-pointer"
            onClick={() => setCredenzaOpen(true)}
          >
            {config.text}
          </Badge>,
        )}

      {(status === 'pending_received' || status === 'friend_only') &&
        badgeTooltip(<Badge variant={config.variant}>{config.text}</Badge>)}

      {status === 'pending_sent' && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Badge variant={config.variant} className="cursor-pointer">
                  {config.text}
                </Badge>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{config.tooltip}</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => setPendingAction('cancel')}>
              Cancel Request
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPendingAction('resend')}>
              Resend Request
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {status === 'friend' && (
        <RemoveFriendCredenza
          open={credenzaOpen}
          onOpenChange={setCredenzaOpen}
          username={username}
          avatar={avatar}
          uuid={uuid}
          onStatusChange={onStatusChange}
        />
      )}

      {status === 'server_only' && (
        <SendFriendRequestCredenza
          open={credenzaOpen}
          onOpenChange={setCredenzaOpen}
          username={username}
          avatar={avatar}
          uuid={uuid}
          onStatusChange={onStatusChange}
        />
      )}

      {status === 'pending_sent' && (
        <>
          <CancelFriendRequestCredenza
            open={pendingAction === 'cancel'}
            onOpenChange={(open) => {
              if (!open) setPendingAction(null)
            }}
            username={username}
            avatar={avatar}
            uuid={uuid}
            pendingSince={pendingSince}
            onStatusChange={onStatusChange}
          />

          <ResendFriendRequestCredenza
            open={pendingAction === 'resend'}
            onOpenChange={(open) => {
              if (!open) setPendingAction(null)
            }}
            username={username}
            avatar={avatar}
            uuid={uuid}
            pendingSince={pendingSince}
            onStatusChange={onStatusChange}
          />
        </>
      )}
    </>
  )
}

interface CredenzaCommonProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
  avatar?: string | null
  uuid: string
  onStatusChange: () => void
}

function UserAvatar({
  username,
  avatar,
}: {
  username: string
  avatar?: string | null
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10" style={{ backgroundColor: '#212121' }}>
        {avatar && (
          <AvatarImage src={avatar} alt={username} className="object-cover" />
        )}
        <AvatarFallback
          style={{ backgroundColor: '#212121' }}
          className="text-white"
        >
          {username.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{username}</span>
    </div>
  )
}

function SendFriendRequestCredenza({
  open,
  onOpenChange,
  username,
  avatar,
  uuid,
  onStatusChange,
}: CredenzaCommonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSend = async () => {
    setIsSubmitting(true)
    try {
      await apiClient.post('/v1/plex/send-friend-request', { uuid })
      toast.success(`Friend request sent to ${username}`)
      onStatusChange()
      onOpenChange(false)
    } catch {
      toast.error(`Failed to send friend request to ${username}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Send Friend Request
          </CredenzaTitle>
          <CredenzaDescription>
            This user is on your server but not on your friends list. Adding
            them as a friend allows Pulsarr to sync their watchlist.
          </CredenzaDescription>
        </CredenzaHeader>
        <div className="px-4 md:px-0 py-4">
          <UserAvatar username={username} avatar={avatar} />
        </div>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button onClick={handleSend} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Send Request'
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

function RemoveFriendCredenza({
  open,
  onOpenChange,
  username,
  avatar,
  uuid,
  onStatusChange,
}: CredenzaCommonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleRemove = async () => {
    setIsSubmitting(true)
    try {
      await apiClient.post('/v1/plex/cancel-friend-request', { uuid })
      toast.success(`${username} removed from friends`)
      onStatusChange()
      onOpenChange(false)
    } catch {
      toast.error(`Failed to remove ${username} from friends`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Remove Friend
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to remove this user from your friends list?
            Pulsarr will no longer be able to sync their watchlist.
          </CredenzaDescription>
        </CredenzaHeader>
        <div className="px-4 md:px-0 py-4">
          <UserAvatar username={username} avatar={avatar} />
        </div>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={handleRemove}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Removing...
              </>
            ) : (
              'Remove Friend'
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

interface PendingCredenzaProps extends CredenzaCommonProps {
  pendingSince?: string | null
}

function CancelFriendRequestCredenza({
  open,
  onOpenChange,
  username,
  avatar,
  uuid,
  pendingSince,
  onStatusChange,
}: PendingCredenzaProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCancel = async () => {
    setIsSubmitting(true)
    try {
      await apiClient.post('/v1/plex/cancel-friend-request', { uuid })
      toast.success(`Friend request to ${username} canceled`)
      onStatusChange()
      onOpenChange(false)
    } catch {
      toast.error(`Failed to cancel friend request to ${username}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Cancel Friend Request
          </CredenzaTitle>
          <CredenzaDescription>
            Are you sure you want to cancel the pending friend request?
            {pendingSince &&
              ` Sent on ${new Date(pendingSince).toLocaleDateString()}.`}
          </CredenzaDescription>
        </CredenzaHeader>
        <div className="px-4 md:px-0 py-4">
          <UserAvatar username={username} avatar={avatar} />
        </div>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Close</Button>
          </CredenzaClose>
          <Button
            variant="clear"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Canceling...
              </>
            ) : (
              'Cancel Request'
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}

function ResendFriendRequestCredenza({
  open,
  onOpenChange,
  username,
  avatar,
  uuid,
  pendingSince,
  onStatusChange,
}: PendingCredenzaProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleResend = async () => {
    setIsSubmitting(true)
    try {
      await apiClient.post('/v1/plex/cancel-friend-request', { uuid })
      await apiClient.post('/v1/plex/send-friend-request', { uuid })
      toast.success(`Friend request resent to ${username}`)
      onStatusChange()
      onOpenChange(false)
    } catch {
      toast.error(`Failed to resend friend request to ${username}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Credenza open={open} onOpenChange={onOpenChange}>
      <CredenzaContent>
        <CredenzaHeader>
          <CredenzaTitle className="text-foreground">
            Resend Friend Request
          </CredenzaTitle>
          <CredenzaDescription>
            This will cancel the current request and send a new one.
            {pendingSince &&
              ` Original sent on ${new Date(pendingSince).toLocaleDateString()}.`}
          </CredenzaDescription>
        </CredenzaHeader>
        <div className="px-4 md:px-0 py-4">
          <UserAvatar username={username} avatar={avatar} />
        </div>
        <CredenzaFooter>
          <CredenzaClose asChild>
            <Button variant="neutral">Cancel</Button>
          </CredenzaClose>
          <Button onClick={handleResend} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Resend Request'
            )}
          </Button>
        </CredenzaFooter>
      </CredenzaContent>
    </Credenza>
  )
}
