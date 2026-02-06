import { ErrorSchema as CommonErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

const SendFriendRequestBodySchema = z.object({
  uuid: z.string().min(1),
})

const SendFriendRequestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const sendFriendRequestSchema = {
  summary: 'Send a Plex friend request',
  operationId: 'sendPlexFriendRequest',
  description: 'Sends a friend request to a Plex user by UUID',
  tags: ['Plex'],
  body: SendFriendRequestBodySchema,
  response: {
    200: SendFriendRequestResponseSchema,
    400: CommonErrorSchema,
    500: CommonErrorSchema,
  },
}

export { SendFriendRequestBodySchema }

export type SendFriendRequestBody = z.infer<typeof SendFriendRequestBodySchema>
export type SendFriendRequestResponse = z.infer<
  typeof SendFriendRequestResponseSchema
>
export type SendFriendRequestError = z.infer<typeof CommonErrorSchema>
