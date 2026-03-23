import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { CronExpressionParser } from 'cron-parser'
import { z } from 'zod'

export const IntervalConfigSchema = z
  .object({
    days: z.number().int().positive().max(365).optional(),
    hours: z.number().int().positive().max(8760).optional(),
    minutes: z.number().int().positive().max(525600).optional(),
    seconds: z.number().int().positive().max(31536000).optional(),
    runImmediately: z.boolean().optional(),
  })
  .refine(
    (config) =>
      config.days !== undefined ||
      config.hours !== undefined ||
      config.minutes !== undefined ||
      config.seconds !== undefined,
    {
      message:
        'At least one time unit (days, hours, minutes, or seconds) must be specified',
    },
  )

export const CronConfigSchema = z.object({
  expression: z
    .string()
    .min(1, { error: 'Cron expression is required' })
    .refine(
      (expression) => {
        try {
          CronExpressionParser.parse(expression, { currentDate: new Date() })
          return true
        } catch (_error) {
          return false
        }
      },
      {
        message:
          'Invalid cron expression (format: [second] minute hour day month weekday)',
      },
    ),
})

export const ScheduleConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('interval'),
    name: z.string().min(1, { error: 'Name is required' }),
    config: IntervalConfigSchema,
    enabled: z.boolean().optional().default(true),
  }),
  z.object({
    type: z.literal('cron'),
    name: z.string().min(1, { error: 'Name is required' }),
    config: CronConfigSchema,
    enabled: z.boolean().optional().default(true),
  }),
])

export const ScheduleUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('interval'),
    config: IntervalConfigSchema.optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('cron'),
    config: CronConfigSchema.optional(),
    enabled: z.boolean().optional(),
  }),
])

export const JobRunInfoSchema = z.object({
  time: z.string(),
  status: z.enum(['completed', 'failed', 'pending']),
  error: z.string().optional(),
  estimated: z.boolean().optional(),
})

const IntervalJobSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.literal('interval'),
  config: IntervalConfigSchema,
  enabled: z.boolean(),
  last_run: JobRunInfoSchema.nullable(),
  next_run: JobRunInfoSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

const CronJobSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.literal('cron'),
  config: CronConfigSchema,
  enabled: z.boolean(),
  last_run: JobRunInfoSchema.nullable(),
  next_run: JobRunInfoSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const JobStatusSchema = z.union([IntervalJobSchema, CronJobSchema])

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export { ErrorSchema, ErrorSchema as ErrorResponseSchema }

export const DeleteItemSchema = z.object({
  title: z.string(),
  guid: z.string(),
  instance: z.string(),
})

export const DeletionContentTypeResultSchema = z.object({
  deleted: z.number(),
  skipped: z.number(),
  protected: z.number().optional(),
  items: z.array(DeleteItemSchema).readonly(),
})

export const DeleteSyncResultSchema = z.object({
  total: z.object({
    deleted: z.number(),
    skipped: z.number(),
    processed: z.number(),
    protected: z.number().optional(),
  }),
  movies: DeletionContentTypeResultSchema,
  shows: DeletionContentTypeResultSchema,
  safetyTriggered: z.boolean().optional(),
  safetyMessage: z.string().optional(),
})

export const DeleteSyncDryRunResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  results: DeleteSyncResultSchema,
})

export type IntervalConfig = z.infer<typeof IntervalConfigSchema>
export type CronConfig = z.infer<typeof CronConfigSchema>
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>
export type ScheduleUpdate = z.infer<typeof ScheduleUpdateSchema>
export type JobRunInfo = z.infer<typeof JobRunInfoSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>
export type ErrorResponse = z.infer<typeof ErrorSchema>
export type DeleteItem = z.infer<typeof DeleteItemSchema>
export type DeletionContentTypeResult = z.infer<
  typeof DeletionContentTypeResultSchema
>
export type DeleteSyncResult = z.infer<typeof DeleteSyncResultSchema>
export type DeleteSyncDryRunResponse = z.infer<
  typeof DeleteSyncDryRunResponseSchema
>
