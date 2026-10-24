import { z } from 'zod'

export const PlexFriendStatusSchema = z
  .enum([
    'friend',
    'server_only',
    'pending_sent',
    'pending_received',
    'friend_only',
    'self',
    'managed',
  ])
  .meta({
    id: 'PlexFriendStatus',
    description:
      'Plex relationship of a user to the server owner, from friends, server shares and pending requests',
  })

export type PlexFriendStatus = z.infer<typeof PlexFriendStatusSchema>
