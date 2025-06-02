import { z } from 'zod'

// Base rolling monitored show schema
const RollingMonitoredShowSchema = z.object({
  id: z.number(),
  sonarr_series_id: z.number(),
  tvdb_id: z.string().nullable(),
  imdb_id: z.string().nullable(),
  show_title: z.string(),
  monitoring_type: z.enum(['pilotRolling', 'firstSeasonRolling']),
  current_monitored_season: z.number(),
  last_watched_season: z.number(),
  last_watched_episode: z.number(),
  last_session_date: z.string().nullable(),
  sonarr_instance_id: z.number(),
  plex_user_id: z.string().nullable(),
  plex_username: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  last_updated_at: z.string(),
})

// Session monitoring result schema
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

// Schema for getting rolling monitored shows
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
    400: z.object({
      error: z.string(),
    }),
  },
}

// Schema for manually running session monitor
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
    400: z.object({
      error: z.string(),
    }),
  },
}

// Schema for deleting a rolling monitored show
export const deleteRollingMonitoredSchema = {
  summary: 'Delete rolling monitored show',
  operationId: 'deleteRollingMonitoredShow',
  description:
    'Remove a show from rolling monitoring and stop tracking its viewing activity',
  tags: ['Session Monitoring'],
  params: z.object({
    id: z.string(),
  }),
  response: {
    200: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    400: z.object({
      error: z.string(),
    }),
    404: z.object({
      error: z.string(),
    }),
  },
}

// Schema for resetting a rolling monitored show
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
    400: z.object({
      error: z.string(),
    }),
    404: z.object({
      error: z.string(),
    }),
  },
}

// Schema for resetting inactive shows
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
    400: z.object({
      error: z.string(),
    }),
  },
}

// Schema for getting inactive rolling monitored shows
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
    400: z.object({
      error: z.string(),
    }),
  },
}
