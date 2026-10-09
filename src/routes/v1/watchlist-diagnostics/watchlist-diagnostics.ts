import {
  RunWatchlistDiagnosticsParamsSchema,
  RunWatchlistDiagnosticsResponseSchema,
  WatchlistDiagnosticsErrorSchema,
} from '@schemas/watchlist-diagnostics/watchlist-diagnostics.schema.js'
import {
  WatchlistDiagnosticsError,
  WatchlistDiagnosticsService,
} from '@services/watchlist-diagnostics.service.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // One instance per app so the per-user cooldown and single-run guard are shared
  const diagnostics = new WatchlistDiagnosticsService(fastify.log, {
    db: fastify.db,
    getPlexTokens: () => fastify.config.plexTokens ?? [],
    getWorkflowStatus: () => ({
      status: fastify.watchlistWorkflow?.getStatus() ?? 'stopped',
      rssMode: fastify.watchlistWorkflow?.isRssMode() ?? false,
    }),
  })

  // POST rather than GET: each run calls Plex, so it must never be prefetched,
  // cached or refetched in the background. It still writes nothing.
  fastify.post(
    '/users/:userId',
    {
      schema: {
        summary: 'Run watchlist diagnostics for a user',
        operationId: 'runWatchlistDiagnostics',
        description:
          "Fetches the user's live Plex watchlist and explains, per item, why it is or is not in Radarr/Sonarr. Read-only: nothing is written or routed. Limited to one run at a time and one run per user per minute.",
        params: RunWatchlistDiagnosticsParamsSchema,
        response: {
          200: RunWatchlistDiagnosticsResponseSchema,
          400: WatchlistDiagnosticsErrorSchema,
          404: WatchlistDiagnosticsErrorSchema,
          429: WatchlistDiagnosticsErrorSchema,
          500: WatchlistDiagnosticsErrorSchema,
          502: WatchlistDiagnosticsErrorSchema,
          503: WatchlistDiagnosticsErrorSchema,
        },
        tags: ['Watchlist Diagnostics'],
      },
    },
    async (request, reply) => {
      // Stop paging Plex once the admin closes the page
      const abortController = new AbortController()
      reply.raw.once('close', () => {
        if (!reply.raw.writableFinished) {
          abortController.abort(new Error('client disconnected'))
        }
      })

      try {
        const result = await diagnostics.run(
          request.params.userId,
          abortController.signal,
        )
        return {
          success: true,
          message: 'Watchlist diagnostics completed',
          diagnostics: result,
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          request.log.debug(
            { userId: request.params.userId },
            'Watchlist diagnostics aborted by client disconnect',
          )
          return reply
        }
        if (error instanceof WatchlistDiagnosticsError) {
          if (error.retryAfterSeconds !== undefined) {
            reply.header('Retry-After', String(error.retryAfterSeconds))
          }
          return sendDiagnosticsError(reply, error)
        }
        logRouteError(fastify.log, request, error, {
          message: 'Failed to run watchlist diagnostics',
        })
        return reply.internalServerError('Failed to run watchlist diagnostics')
      }
    },
  )
}

function sendDiagnosticsError(
  reply: FastifyReply,
  error: WatchlistDiagnosticsError,
) {
  switch (error.code) {
    case 'user_not_found':
      return reply.notFound(error.message)
    case 'not_configured':
      return reply.badRequest(error.message)
    case 'busy':
    case 'cooldown':
      return reply.tooManyRequests(error.message)
    case 'plex_rate_limited':
      return reply.serviceUnavailable(error.message)
    case 'plex_unavailable':
      return reply.badGateway(error.message)
  }
}

export default plugin
