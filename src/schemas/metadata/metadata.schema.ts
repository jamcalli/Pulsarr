import { z } from 'zod'

// Metadata refresh success response schema
export const MetadataRefreshSuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  totalItems: z.number(),
  selfItems: z.number(),
  othersItems: z.number(),
})

// Metadata refresh error response schema
export const MetadataRefreshErrorResponseSchema = z.object({
  success: z.boolean().default(false),
  message: z.string(),
})

// Type exports
export type MetadataRefreshSuccessResponse = z.infer<
  typeof MetadataRefreshSuccessResponseSchema
>
export type MetadataRefreshErrorResponse = z.infer<
  typeof MetadataRefreshErrorResponseSchema
>
