import { z } from 'zod'

export const SESSION_POLLING_INTERVAL_MINUTES = { min: 1, max: 1440 } as const
export const SESSION_REMAINING_EPISODES = { min: 1, max: 10 } as const
export const SESSION_INACTIVITY_RESET_DAYS = { min: 1, max: 365 } as const
export const SESSION_AUTO_RESET_INTERVAL_HOURS = { min: 1, max: 168 } as const

export const PlexSessionMonitoringConfigSchema = z
  .object({
    enabled: z.boolean(),
    pollingIntervalMinutes: z.number(),
    remainingEpisodes: z.number(),
    filterUsers: z.array(z.string()).optional(),
    enableAutoReset: z.boolean().optional(),
    inactivityResetDays: z.number().optional(),
    autoResetIntervalHours: z.number().optional(),
    enableProgressiveCleanup: z.boolean().optional(),
  })
  .meta({
    id: 'PlexSessionMonitoringConfig',
    description:
      'How Plex viewing sessions drive rolling Sonarr monitoring and its automatic resets',
  })

export const PlexSessionMonitoringConfigPayloadSchema = z.object({
  enabled: z.boolean(),
  pollingIntervalMinutes: z
    .number()
    .min(SESSION_POLLING_INTERVAL_MINUTES.min)
    .max(SESSION_POLLING_INTERVAL_MINUTES.max),
  remainingEpisodes: z
    .number()
    .min(SESSION_REMAINING_EPISODES.min)
    .max(SESSION_REMAINING_EPISODES.max),
  filterUsers: z.array(z.string()).optional(),
  enableAutoReset: z.boolean().optional(),
  inactivityResetDays: z
    .number()
    .min(SESSION_INACTIVITY_RESET_DAYS.min)
    .max(SESSION_INACTIVITY_RESET_DAYS.max)
    .optional(),
  autoResetIntervalHours: z
    .number()
    .min(SESSION_AUTO_RESET_INTERVAL_HOURS.min)
    .max(SESSION_AUTO_RESET_INTERVAL_HOURS.max)
    .optional(),
  enableProgressiveCleanup: z.boolean().optional(),
})

export type PlexSessionMonitoringConfig = z.infer<
  typeof PlexSessionMonitoringConfigSchema
>

export const PLEX_SESSION_MONITORING_DEFAULTS: Required<PlexSessionMonitoringConfig> =
  {
    enabled: false,
    pollingIntervalMinutes: 15,
    remainingEpisodes: 2,
    filterUsers: [],
    enableAutoReset: true,
    inactivityResetDays: 7,
    autoResetIntervalHours: 24,
    enableProgressiveCleanup: false,
  }
