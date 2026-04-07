import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const AliasReadinessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  missingAliasCount: z.number(),
  duplicateAliasCount: z.number(),
})

export type AliasReadinessResponse = z.infer<
  typeof AliasReadinessResponseSchema
>

export { ErrorSchema as AliasReadinessErrorSchema }
export type AliasReadinessError = z.infer<typeof ErrorSchema>
