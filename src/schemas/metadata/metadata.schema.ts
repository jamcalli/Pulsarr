import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const MetadataRefreshSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  totalItems: z.number(),
  selfItems: z.number(),
  othersItems: z.number(),
})

export { ErrorSchema as MetadataRefreshErrorResponseSchema }

export type MetadataRefreshSuccessResponse = z.infer<
  typeof MetadataRefreshSuccessResponseSchema
>
export type MetadataRefreshErrorResponse = z.infer<typeof ErrorSchema>
