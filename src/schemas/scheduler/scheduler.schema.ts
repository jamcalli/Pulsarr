import { z } from 'zod'

// Zod schema for interval configuration
export const IntervalConfigSchema = z.object({
  days: z.number().int().nonnegative().optional(),
  hours: z.number().int().nonnegative().optional(),
  minutes: z.number().int().nonnegative().optional(),
  seconds: z.number().int().nonnegative().optional(),
  runImmediately: z.boolean().optional(),
})

// Zod schema for cron configuration
export const CronConfigSchema = z.object({
  expression: z.string().min(1, 'Cron expression is required'),
})

// Zod schema for job configuration
export const ScheduleConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('interval'),
    name: z.string().min(1, 'Name is required'),
    config: IntervalConfigSchema,
    enabled: z.boolean().optional().default(true),
  }),
  z.object({
    type: z.literal('cron'),
    name: z.string().min(1, 'Name is required'),
    config: CronConfigSchema,
    enabled: z.boolean().optional().default(true),
  }),
])

// Create schema for partial updates (without the name field)
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

// Rest of your type definitions remain the same...
export const JobRunInfoSchema = z.object({
  time: z.string(),
  status: z.enum(['completed', 'failed', 'pending']),
  error: z.string().optional(),
  estimated: z.boolean().optional(),
})

// Define specific job types
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

// Combine with regular union instead of discriminated union
export const JobStatusSchema = z.union([IntervalJobSchema, CronJobSchema])

// Standard response schemas
export const SuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const ErrorResponseSchema = z.object({
  error: z.string(),
})

// Schema for delete sync dry run results
export const DeleteItemSchema = z.object({
  title: z.string(),
  guid: z.string(),
  instance: z.string(),
})

export const DeletionContentTypeResultSchema = z.object({
  deleted: z.number(),
  skipped: z.number(),
  protected: z.number().optional(),
  items: z.array(DeleteItemSchema),
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

// Inferred types for exports
export type IntervalConfig = z.infer<typeof IntervalConfigSchema>
export type CronConfig = z.infer<typeof CronConfigSchema>
export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>
export type ScheduleUpdate = z.infer<typeof ScheduleUpdateSchema>
export type JobRunInfo = z.infer<typeof JobRunInfoSchema>
export type JobStatus = z.infer<typeof JobStatusSchema>
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type DeleteItem = z.infer<typeof DeleteItemSchema>
export type DeletionContentTypeResult = z.infer<
  typeof DeletionContentTypeResultSchema
>
export type DeleteSyncResult = z.infer<typeof DeleteSyncResultSchema>
export type DeleteSyncDryRunResponse = z.infer<
  typeof DeleteSyncDryRunResponseSchema
>
