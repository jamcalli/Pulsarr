import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const MetadataRefreshAcceptedResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .meta({
    id: 'MetadataRefreshAccepted',
    description: 'The metadata refresh was started in the background.',
  })

export { ErrorSchema as MetadataRefreshErrorResponseSchema }

export type MetadataRefreshAcceptedResponse = z.infer<
  typeof MetadataRefreshAcceptedResponseSchema
>
export type MetadataRefreshErrorResponse = z.infer<typeof ErrorSchema>
