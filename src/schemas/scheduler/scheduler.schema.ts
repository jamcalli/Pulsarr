import { BackgroundRunStatusSchema } from '@root/schemas/common/background-run.schema.js'
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
} from '@root/schemas/shared/time-units.js'
import { Cron } from 'croner'
import { z } from 'zod'

/** Exclusive upper bound on an interval, the longest delay a timer accepts. */
export const INTERVAL_LIMIT_MS = 2_147_483_647

const unitMax = (unitMs: number) => Math.floor((INTERVAL_LIMIT_MS - 1) / unitMs)

export function intervalToMs(config: {
  days?: number
  hours?: number
  minutes?: number
  seconds?: number
}): number {
  return (
    (config.days ?? 0) * MS_PER_DAY +
    (config.hours ?? 0) * MS_PER_HOUR +
    (config.minutes ?? 0) * MS_PER_MINUTE +
    (config.seconds ?? 0) * MS_PER_SECOND
  )
}

const INTERVAL_LIMIT_DAYS =
  Math.floor((INTERVAL_LIMIT_MS / MS_PER_DAY) * 10) / 10

export const IntervalConfigSchema = z
  .object({
    days: z.number().optional(),
    hours: z.number().optional(),
    minutes: z.number().optional(),
    seconds: z.number().optional(),
  })
  .meta({
    id: 'JobIntervalConfig',
    description: 'Time units between runs of an interval job',
  })

export const IntervalConfigPayloadSchema = IntervalConfigSchema.extend({
  days: z.number().int().positive().max(unitMax(MS_PER_DAY)).optional(),
  hours: z.number().int().positive().max(unitMax(MS_PER_HOUR)).optional(),
  minutes: z.number().int().positive().max(unitMax(MS_PER_MINUTE)).optional(),
  seconds: z.number().int().positive().max(unitMax(MS_PER_SECOND)).optional(),
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
  .refine((config) => intervalToMs(config) < INTERVAL_LIMIT_MS, {
    message: `Interval must be shorter than ${INTERVAL_LIMIT_DAYS} days`,
  })
  .meta({
    id: 'JobIntervalConfigPayload',
    description:
      'Time units between runs of an interval job, within what a timer can run',
  })

function isValidCronExpression(expression: string): boolean {
  try {
    // A date string parses as a one-shot run with no pattern
    return new Cron(expression).getPattern() !== undefined
  } catch {
    return false
  }
}

export const CronConfigSchema = z
  .object({ expression: z.string() })
  .meta({ id: 'JobCronConfig', description: 'Cron expression of a cron job' })

export const CronConfigPayloadSchema = z
  .object({
    expression: z
      .string()
      .min(1, { error: 'Cron expression is required' })
      .refine(isValidCronExpression, {
        message:
          'Invalid cron expression (format: [second] minute hour day month weekday)',
      }),
  })
  .meta({
    id: 'JobCronConfigPayload',
    description: 'Cron expression of a cron job, checked by the cron parser',
  })

const ScheduleUpdateBaseSchema = z.object({ enabled: z.boolean().optional() })

export const ScheduleUpdateSchema = z
  .discriminatedUnion('type', [
    ScheduleUpdateBaseSchema.extend({
      type: z.literal('interval'),
      config: IntervalConfigPayloadSchema.optional(),
    }),
    ScheduleUpdateBaseSchema.extend({
      type: z.literal('cron'),
      config: CronConfigPayloadSchema.optional(),
    }),
  ])
  .meta({
    id: 'JobScheduleUpdatePayload',
    description: 'New timing or enabled state for a scheduled job',
  })

export const JobRunInfoSchema = z
  .object({
    time: z.string(),
    status: z.enum(['completed', 'failed', 'pending']),
    error: z.string().optional(),
    estimated: z.boolean().optional(),
  })
  .meta({ id: 'JobRunInfo', description: 'One past or upcoming run of a job' })

const JobRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  enabled: z.boolean(),
  last_run: JobRunInfoSchema.nullable(),
  next_run: JobRunInfoSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  running: z.boolean().meta({
    description: 'True while a run of the job is in progress',
  }),
})

export const JobStatusSchema = z
  .union([
    JobRowSchema.extend({
      type: z.literal('interval'),
      config: IntervalConfigSchema,
    }),
    JobRowSchema.extend({ type: z.literal('cron'), config: CronConfigSchema }),
  ])
  .meta({ id: 'JobStatus', description: 'A scheduled job and its run state' })

export const DeleteItemSchema = z
  .object({
    title: z.string(),
    guid: z.string(),
    instance: z.string(),
  })
  .meta({
    id: 'DeleteSyncResultItem',
    description: 'One item a delete sync run deleted or would delete',
  })

export const DeletionContentTypeResultSchema = z
  .object({
    deleted: z.number(),
    skipped: z.number(),
    protected: z.number().optional(),
    items: z.array(DeleteItemSchema).readonly(),
  })
  .meta({
    id: 'DeleteSyncTypeResult',
    description: 'Delete sync counts and items for one content type',
  })

export const DeleteSyncResultSchema = z
  .object({
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
  .meta({
    id: 'DeleteSyncResult',
    description: 'Totals and per-type results of a delete sync run',
  })

export const DeleteSyncDryRunResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    results: DeleteSyncResultSchema,
  })
  .meta({
    id: 'DeleteSyncDryRunResponse',
    description: 'Outcome of a delete sync dry run',
  })

export const DeleteSyncDryRunStatusSchema = BackgroundRunStatusSchema.extend({
  result: DeleteSyncDryRunResponseSchema.nullable().meta({
    description: 'The latest dry run outcome, null until a dry run finishes',
  }),
}).meta({
  id: 'DeleteSyncDryRunStatus',
  description: 'The latest delete sync dry run',
})

export type ScheduleUpdate = z.infer<typeof ScheduleUpdateSchema>
