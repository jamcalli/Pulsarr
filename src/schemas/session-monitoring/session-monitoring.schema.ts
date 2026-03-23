import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'
export const MonitoringTypeEnum = z.enum([
  'pilotRolling',
  'firstSeasonRolling',
  'allSeasonPilotRolling',
])
const RollingMonitoredShowSchema = z.object({
  id: z.number(),
  sonarr_series_id: z.number(),
  tvdb_id: z.string().nullish(),
  imdb_id: z.string().nullish(),
  show_title: z.string(),
  monitoring_type: MonitoringTypeEnum,
  current_monitored_season: z.number(),
  last_watched_season: z.number(),
  last_watched_episode: z.number(),
  last_session_date: z.string().nullish(),
  sonarr_instance_id: z.number(),
  plex_user_id: z.string().nullish(),
  plex_username: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string(),
  last_updated_at: z.string(),
})
const SessionMonitoringResultSchema = z.object({
  processedSessions: z.number(),
  triggeredSearches: z.number(),
  errors: z.array(z.string()),
  rollingUpdates: z.array(
    z.object({
      showTitle: z.string(),
      action: z.enum([
        'expanded_to_season',
        'expanded_to_next_season',
        'switched_to_all',
      ]),
      details: z.string(),
    }),
  ),
})
export const getRollingMonitoredSchema = {
  summary: 'Get rolling monitored shows',
  operationId: 'getRollingMonitoredShows',
  description:
    'Retrieve all shows currently being monitored by the rolling monitoring system',
  tags: ['Session Monitoring'],
  response: {
    200: z.object({
      success: z.boolean(),
      shows: z.array(RollingMonitoredShowSchema),
    }),
    400: ErrorSchema,
  },
}
export const runSessionMonitorSchema = {
  summary: 'Run session monitor manually',
  operationId: 'runSessionMonitor',
  description:
    'Manually trigger the Plex session monitoring process to check for viewing activity and update rolling monitored shows',
  tags: ['Session Monitoring'],
  response: {
    200: z.object({
      success: z.boolean(),
      result: SessionMonitoringResultSchema,
    }),
    400: ErrorSchema,
  },
}
export const deleteRollingMonitoredSchema = {
  summary: 'Delete rolling monitored show',
  operationId: 'deleteRollingMonitoredShow',
  description:
    'Remove a show from rolling monitoring and stop tracking its viewing activity',
  tags: ['Session Monitoring'],
  params: z.object({
    id: z.string(),
  }),
  querystring: z.object({
    reset: z.string().optional(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    400: ErrorSchema,
    404: ErrorSchema,
  },
}
export const resetRollingMonitoredSchema = {
  summary: 'Reset rolling monitored show',
  operationId: 'resetRollingMonitoredShow',
  description:
    'Reset a rolling monitored show back to its original monitoring state (pilot only or first season only)',
  tags: ['Session Monitoring'],
  params: z.object({
    id: z.string(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    400: ErrorSchema,
    404: ErrorSchema,
  },
}
export const resetInactiveShowsSchema = {
  summary: 'Reset inactive rolling monitored shows',
  operationId: 'resetInactiveRollingMonitoredShows',
  description:
    'Reset all rolling monitored shows that have been inactive for a specified number of days',
  tags: ['Session Monitoring'],
  body: z.object({
    inactivityDays: z.number().min(1).max(365).optional(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
      resetCount: z.number(),
    }),
    400: ErrorSchema,
  },
}
export const getInactiveRollingMonitoredSchema = {
  summary: 'Get inactive rolling monitored shows',
  operationId: 'getInactiveRollingMonitoredShows',
  description:
    'Retrieve rolling monitored shows that have been inactive for a specified number of days',
  tags: ['Session Monitoring'],
  querystring: z.object({
    inactivityDays: z.coerce.number().min(1).max(365).optional(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      shows: z.array(RollingMonitoredShowSchema),
      inactivityDays: z.number(),
    }),
    400: ErrorSchema,
  },
}
export const getSonarrShowsSchema = {
  summary: 'Get Sonarr shows with enrollment status',
  operationId: 'getSonarrShows',
  description:
    'Retrieve all Pulsarr-tracked Sonarr shows with their rolling monitoring enrollment status',
  tags: ['Session Monitoring'],
  querystring: z.object({
    instanceId: z.coerce.number().int().positive().optional(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      shows: z.array(
        z.object({
          watchlistId: z.number(),
          sonarrInstanceId: z.number(),
          sonarrSeriesId: z.number(),
          title: z.string(),
          guids: z.array(z.string()),
          rollingShowId: z.number().nullable(),
          monitoringType: MonitoringTypeEnum.nullable(),
        }),
      ),
    }),
    400: ErrorSchema,
  },
}
export const bulkManageRollingMonitoredSchema = {
  summary: 'Bulk manage rolling monitored shows',
  operationId: 'bulkManageRollingMonitoredShows',
  description:
    'Enroll new shows into rolling monitoring and/or change the monitoring type of already-enrolled shows in bulk',
  tags: ['Session Monitoring'],
  body: z.object({
    shows: z.array(
      z.object({
        sonarrSeriesId: z.number().int().positive(),
        sonarrInstanceId: z.number().int().positive(),
        title: z.string(),
        guids: z.array(z.string()),
        rollingShowId: z.number().nullable(),
      }),
    ),
    monitoringType: MonitoringTypeEnum,
    resetMonitoring: z.boolean().optional(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
      enrolled: z.number(),
      modified: z.number(),
      skipped: z.number(),
    }),
    400: ErrorSchema,
  },
}
export const RollingMonitoredListResponseSchema =
  getRollingMonitoredSchema.response[200]
export const InactiveRollingMonitoredResponseSchema =
  getInactiveRollingMonitoredSchema.response[200]
export const RunSessionMonitorResponseSchema =
  runSessionMonitorSchema.response[200]
export const ResetRollingMonitoredResponseSchema =
  resetRollingMonitoredSchema.response[200]
export const DeleteRollingMonitoredResponseSchema =
  deleteRollingMonitoredSchema.response[200]
export const ResetInactiveShowsResponseSchema =
  resetInactiveShowsSchema.response[200]
export const SonarrShowsResponseSchema = getSonarrShowsSchema.response[200]
export const BulkManageResponseSchema =
  bulkManageRollingMonitoredSchema.response[200]

export type RollingMonitoredShow = z.infer<typeof RollingMonitoredShowSchema>
export type SessionMonitoringResult = z.infer<
  typeof SessionMonitoringResultSchema
>
export type RollingMonitoredListResponse = z.infer<
  typeof RollingMonitoredListResponseSchema
>
export type InactiveRollingMonitoredResponse = z.infer<
  typeof InactiveRollingMonitoredResponseSchema
>
export type RunSessionMonitorResponse = z.infer<
  typeof RunSessionMonitorResponseSchema
>
export type ResetRollingMonitoredResponse = z.infer<
  typeof ResetRollingMonitoredResponseSchema
>
export type DeleteRollingMonitoredResponse = z.infer<
  typeof DeleteRollingMonitoredResponseSchema
>
export type ResetInactiveShowsResponse = z.infer<
  typeof ResetInactiveShowsResponseSchema
>
export type SonarrShowsResponse = z.infer<typeof SonarrShowsResponseSchema>
export type BulkManageResponse = z.infer<typeof BulkManageResponseSchema>
export type BulkManageBody = z.infer<
  typeof bulkManageRollingMonitoredSchema.body
>
export type MonitoringType = z.infer<typeof MonitoringTypeEnum>
