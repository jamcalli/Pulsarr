import { z } from 'zod'

export const HealthCheckSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string().datetime(),
  checks: z.object({
    database: z.enum(['ok', 'failed']),
  }),
})

export type HealthCheck = z.infer<typeof HealthCheckSchema>

export const HealthCheckResponseSchema = HealthCheckSchema
export type HealthCheckResponse = HealthCheck
