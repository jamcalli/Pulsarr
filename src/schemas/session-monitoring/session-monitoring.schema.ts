import { z } from 'zod'

// Base rolling monitored show schema
const RollingMonitoredShowSchema = z.object({
  id: z.number(),
  sonarr_series_id: z.number(),
  tvdb_id: z.string().nullable(),
  imdb_id: z.string().nullable(),
  show_title: z.string(),
  monitoring_type: z.enum(['pilot_rolling', 'first_season_rolling']),
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
  querystring: z.object({
    inactivityDays: z.string().optional(),
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
