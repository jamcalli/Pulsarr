import { ErrorSchema as CommonErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const CancelFriendRequestBodySchema = z.object({
  uuid: z.string().min(1),
})

const CancelFriendRequestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const cancelFriendRequestSchema = {
  summary: 'Cancel a Plex friend request',
  operationId: 'cancelPlexFriendRequest',
  description: 'Cancels a pending sent friend request to a Plex user by UUID',
  tags: ['Plex'],
  body: CancelFriendRequestBodySchema,
  response: {
    200: CancelFriendRequestResponseSchema,
    400: CommonErrorSchema,
    500: CommonErrorSchema,
  },
}

export { CancelFriendRequestBodySchema }

export type CancelFriendRequestBody = z.infer<
  typeof CancelFriendRequestBodySchema
>
export type CancelFriendRequestResponse = z.infer<
  typeof CancelFriendRequestResponseSchema
>
export type CancelFriendRequestError = z.infer<typeof CommonErrorSchema>
