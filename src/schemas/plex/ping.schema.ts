import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const PingSuccessSchema = z.object({
  success: z.boolean(),
})

export type PingSuccess = z.infer<typeof PingSuccessSchema>

export { ErrorSchema as PingErrorSchema }
export type PingError = z.infer<typeof ErrorSchema>
