import { PlexFriendStatusSchema } from '@root/schemas/shared/plex-friend-status.schema'
import type { StatusTone } from '@/components/status-pill'
import type { components } from '@/types/api.js'

type PlexFriendStatus = components['schemas']['PlexFriendStatus']

export const TRACKED_STATUSES = [
  'self',
  'friend',
  'friend_only',
] as const satisfies ReadonlyArray<PlexFriendStatus>

export type TrackedStatus = (typeof TRACKED_STATUSES)[number]

export const RELATIONSHIP_LABELS: Record<PlexFriendStatus, string> = {
  self: 'Owner',
  friend: 'Friend',
  pending_sent: 'Pending',
  pending_received: 'Incoming',
  server_only: 'No friend',
  friend_only: 'No server',
  managed: 'Managed',
}

export const RELATIONSHIP_TONES: Record<PlexFriendStatus, StatusTone> = {
  self: 'requested',
  friend: 'on',
  pending_sent: 'pending',
  pending_received: 'pending',
  server_only: 'off',
  friend_only: 'off',
  managed: 'requested',
}

export const RELATIONSHIP_MEANING: Record<PlexFriendStatus, string> = {
  self: 'Your own Plex account.',
  friend: 'A Plex friend with access to your server.',
  pending_sent: 'Your friend request waits on them in Plex.',
  pending_received: 'They sent you a friend request. Accept it in Plex.',
  server_only: 'On your server, but not a Plex friend.',
  friend_only:
    "A Plex friend without server access. Requests sync, but they can't watch.",
  managed: 'A Plex Home account without a watchlist.',
}

function isTracked(status: PlexFriendStatus): status is TrackedStatus {
  return TRACKED_STATUSES.some((tracked) => tracked === status)
}

export const RELATIONSHIP_FILTER_OPTIONS: ReadonlyArray<{
  value: TrackedStatus
  label: string
}> = PlexFriendStatusSchema.options.filter(isTracked).map((value) => ({
  value,
  label: RELATIONSHIP_LABELS[value],
}))
