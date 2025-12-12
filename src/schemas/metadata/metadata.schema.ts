import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Metadata refresh success response schema
export const MetadataRefreshSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  totalItems: z.number(),
  selfItems: z.number(),
  othersItems: z.number(),
})

// Re-export shared ErrorSchema with domain-specific alias
export { ErrorSchema as MetadataRefreshErrorResponseSchema }

// Type exports
export type MetadataRefreshSuccessResponse = z.infer<
  typeof MetadataRefreshSuccessResponseSchema
>
export type MetadataRefreshErrorResponse = z.infer<typeof ErrorSchema>
