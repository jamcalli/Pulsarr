import { z } from 'zod'

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string().datetime(),
  checks: z.object({
    database: z.enum(['ok', 'failed']),
  }),
})

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>
