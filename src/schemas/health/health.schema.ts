import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string().datetime(),
  checks: z.object({
    database: z.enum(['ok', 'failed']),
  }),
})

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as HealthCheckErrorSchema }
export type HealthCheckError = z.infer<typeof ErrorSchema>
