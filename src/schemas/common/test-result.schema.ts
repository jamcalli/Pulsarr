import type { NotificationTestResult } from '@root/types/notification.types.js'
import { z } from 'zod'

export const TestResultSchema = z
  .object({
    success: z
      .boolean()
      .meta({ description: 'Whether the test was delivered' }),
    statusCode: z.number().optional().meta({
      description: 'HTTP status from the target, when one responded',
    }),
    error: z
      .string()
      .optional()
      .meta({ description: 'Why the test failed, in plain language' }),
    responseTime: z
      .number()
      .meta({ description: 'Time the test took, in milliseconds' }),
  })
  .meta({
    id: 'TestResult',
    description: 'Result of sending a test notification',
  }) satisfies z.ZodType<NotificationTestResult>
