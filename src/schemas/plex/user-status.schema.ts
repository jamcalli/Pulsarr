import { ErrorSchema as CommonErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const PlexFriendStatusSchema = z.enum([
  'friend',
  'server_only',
  'pending_sent',
  'pending_received',
  'friend_only',
  'self',
])

const PlexClassifiedUserSchema = z.object({
  uuid: z.string(),
  username: z.string(),
  avatar: z.string(),
  displayName: z.string(),
  status: PlexFriendStatusSchema,
  friendCreatedAt: z.string().nullable(),
  pendingSince: z.string().nullable(),
})

const PlexUntrackedUserSchema = z.object({
  uuid: z.string(),
  username: z.string(),
  avatar: z.string(),
  status: PlexFriendStatusSchema,
  pendingSince: z.string().nullable(),
})

const UserStatusResponseSchema = z.object({
  success: z.boolean(),
  users: z.array(PlexClassifiedUserSchema),
  untracked: z.array(PlexUntrackedUserSchema),
})

export const userStatusSchema = {
  summary: 'Get classified Plex user status',
  operationId: 'getPlexUserStatus',
  description:
    'Cross-references friends, server users, and pending requests to classify all known Plex users',
  tags: ['Plex'],
  response: {
    200: UserStatusResponseSchema,
    500: CommonErrorSchema,
  },
}

export { PlexClassifiedUserSchema, PlexUntrackedUserSchema }

export type PlexFriendStatus = z.infer<typeof PlexFriendStatusSchema>
export type PlexClassifiedUser = z.infer<typeof PlexClassifiedUserSchema>
export type PlexUntrackedUser = z.infer<typeof PlexUntrackedUserSchema>
export type UserStatusResponse = z.infer<typeof UserStatusResponseSchema>
export type UserStatusError = z.infer<typeof CommonErrorSchema>
