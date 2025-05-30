import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

// Schema for getting rolling monitored shows
const getRollingMonitoredSchema = {
  response: {
    200: z.object({
      success: z.boolean(),
      shows: z.array(
        z.object({
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
        }),
      ),
    }),
    400: z.object({
      error: z.string(),
    }),
  },
}

// Schema for manually running session monitor
const runSessionMonitorSchema = {
  response: {
    200: z.object({
      success: z.boolean(),
      result: z.object({
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
      }),
    }),
    400: z.object({
      error: z.string(),
    }),
  },
}

// Schema for deleting a rolling monitored show
const deleteRollingMonitoredSchema = {
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

export default async function sessionMonitoringRoutes(
  fastify: FastifyInstance,
) {
  // Get all rolling monitored shows
  fastify.get(
    '/rolling-monitored',
    {
      schema: getRollingMonitoredSchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const shows = await fastify.db.getRollingMonitoredShows()

        return reply.send({
          success: true,
          shows: shows.map((show) => ({
            ...show,
            last_session_date: show.last_session_date?.toISOString() || null,
            created_at: show.created_at.toISOString(),
            updated_at: show.updated_at.toISOString(),
          })),
        })
      } catch (error) {
        request.log.error('Error fetching rolling monitored shows:', error)
        return reply.code(400).send({
          error: 'Failed to fetch rolling monitored shows',
        })
      }
    },
  )

  // Manually run session monitor
  fastify.post(
    '/run',
    {
      schema: runSessionMonitorSchema,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!fastify.config.plexSessionMonitoring?.enabled) {
          return reply.code(400).send({
            error: 'Session monitoring is not enabled',
          })
        }

        request.log.info('Manually triggering session monitor')
        const result = await fastify.plexSessionMonitor.monitorSessions()

        return reply.send({
          success: true,
          result,
        })
      } catch (error) {
        request.log.error('Error running session monitor:', error)
        return reply.code(400).send({
          error: 'Failed to run session monitor',
        })
      }
    },
  )

  // Delete a rolling monitored show
  fastify.delete(
    '/rolling-monitored/:id',
    {
      schema: deleteRollingMonitoredSchema,
    },
    async (
      request: FastifyRequest<{
        Params: { id: string }
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params
        const showId = Number.parseInt(id, 10)

        if (Number.isNaN(showId)) {
          return reply.code(400).send({
            error: 'Invalid show ID',
          })
        }

        // Check if the show exists
        const existingShow =
          await fastify.db.getRollingMonitoredShowById(showId)

        if (!existingShow) {
          return reply.code(404).send({
            error: 'Rolling monitored show not found',
          })
        }

        // Delete the show
        await fastify.db.deleteRollingMonitoredShow(showId)

        request.log.info(`Deleted rolling monitored show with ID ${showId}`)

        return reply.send({
          success: true,
          message: 'Rolling monitored show deleted successfully',
        })
      } catch (error) {
        request.log.error('Error deleting rolling monitored show:', error)
        return reply.code(400).send({
          error: 'Failed to delete rolling monitored show',
        })
      }
    },
  )
}
