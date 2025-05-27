import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import type { z } from 'zod'
import {
  GetRequestParamsSchema,
  GetRequestsQuerySchema,
  MarkAvailableParamsSchema,
  MarkAvailableBodySchema,
  RequestDetailsResponseSchema,
  RequestsListResponseSchema,
  MediaAvailableResponseSchema,
  ErrorResponseSchema,
} from '@root/schemas/seerr-bridge/mock-overseerr.schema.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  // Middleware to verify API key
  const verifyApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string

    if (!apiKey) {
      return reply.code(401).send({ detail: 'Missing X-Api-Key header' })
    }

    if (apiKey !== fastify.config.seerrBridgeApiKey) {
      return reply.code(403).send({ detail: 'Invalid API key' })
    }
  }

  // GET /api/v1/request/:request_id
  fastify.get<{
    Params: z.infer<typeof GetRequestParamsSchema>
    Reply:
      | z.infer<typeof RequestDetailsResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/request/:request_id',
    {
      preHandler: verifyApiKey,
      schema: {
        params: GetRequestParamsSchema,
        description: 'Get request details by ID (Mock Overseerr endpoint)',
        tags: ['seerr-bridge'],
        response: {
          200: RequestDetailsResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { request_id } = request.params
      const requestIdNum = Number.parseInt(request_id, 10)

      fastify.log.info(`Mock Overseerr: Getting request ${request_id}`)

      // Look up the request in our database
      const seerrRequest =
        await fastify.db.getSeerrBridgeRequestById(request_id)

      if (!seerrRequest) {
        return reply.code(404).send({ detail: 'Request not found' })
      }

      // Generate a consistent media_id from the request_id
      // This is a simple hash to ensure consistency
      const mediaId = Math.abs(requestIdNum * 997) % 100000

      const response = {
        id: requestIdNum,
        media: {
          id: mediaId,
          tmdbId: seerrRequest.tmdb_id,
        },
      }

      fastify.log.info(`Mock Overseerr: Returning ${JSON.stringify(response)}`)
      return response
    },
  )

  // GET /api/v1/request
  fastify.get<{
    Querystring: z.infer<typeof GetRequestsQuerySchema>
    Reply:
      | z.infer<typeof RequestsListResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/request',
    {
      preHandler: verifyApiKey,
      schema: {
        querystring: GetRequestsQuerySchema,
        description: 'Get all pending requests (Mock Overseerr endpoint)',
        tags: ['seerr-bridge'],
        response: {
          200: RequestsListResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { take = 500, filter = 'approved' } = request.query

      fastify.log.info(
        `Mock Overseerr: Getting requests with filter=${filter}, take=${take}`,
      )

      // Get pending requests from our database
      const pendingRequests =
        await fastify.db.getAllSeerrBridgeRequests('pending')

      // Format them as Overseerr expects
      const results = pendingRequests.slice(0, take).map((req) => {
        const requestIdNum = Number.parseInt(req.request_id, 10)
        const mediaId = Math.abs(requestIdNum * 997) % 100000

        return {
          id: requestIdNum,
          status: 2, // Approved
          media: {
            id: mediaId,
            tmdbId: req.tmdb_id,
            mediaType: req.media_type,
            status: 3, // Processing
          },
        }
      })

      fastify.log.info(`Mock Overseerr: Returning ${results.length} requests`)
      return { results }
    },
  )

  // POST /api/v1/media/:media_id/available
  fastify.post<{
    Params: z.infer<typeof MarkAvailableParamsSchema>
    Body: z.infer<typeof MarkAvailableBodySchema>
    Reply:
      | z.infer<typeof MediaAvailableResponseSchema>
      | z.infer<typeof ErrorResponseSchema>
  }>(
    '/media/:media_id/available',
    {
      preHandler: verifyApiKey,
      schema: {
        params: MarkAvailableParamsSchema,
        body: MarkAvailableBodySchema,
        description: 'Mark media as available (Mock Overseerr endpoint)',
        tags: ['seerr-bridge'],
        response: {
          200: MediaAvailableResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { media_id } = request.params
      const { is4k = false } = request.body
      const mediaIdNum = Number.parseInt(media_id, 10)

      fastify.log.info(
        `Mock Overseerr: Marking media ${media_id} as available with is4k: ${is4k}`,
      )

      // Find the request that corresponds to this media_id
      // We need to reverse our hash: media_id = (request_id * 997) % 100000
      // This is a simplified lookup - in production you'd store the mapping
      const allRequests = await fastify.db.getAllSeerrBridgeRequests('pending')

      let tmdbId: number | null = null
      let foundRequestId: string | null = null
      let foundRequest = null

      for (const req of allRequests) {
        const requestIdNum = Number.parseInt(req.request_id, 10)
        const calculatedMediaId = Math.abs(requestIdNum * 997) % 100000

        if (calculatedMediaId === mediaIdNum) {
          tmdbId = req.tmdb_id
          foundRequestId = req.request_id
          foundRequest = req
          break
        }
      }

      if (!tmdbId || !foundRequestId || !foundRequest) {
        return reply.code(404).send({ detail: `Media ${media_id} not found` })
      }

      // Update the request status to completed
      await fastify.db.updateSeerrBridgeRequestStatus(
        foundRequestId,
        'completed',
      )

      const response = {
        id: mediaIdNum,
        tmdbId,
        status: 'available',
      }

      fastify.log.info(
        `Mock Overseerr: Media marked as available: ${JSON.stringify(response)}`,
      )

      // Trigger notifications since the media is now available
      if (foundRequest) {
        // Send Discord notification
        if (fastify.config.discordWebhookUrl) {
          await fastify.discord.sendNotification({
            content: undefined,
            embeds: [
              {
                title: 'Media Available via SeerrBridge',
                description: `🎬 ${foundRequest.media_type === 'movie' ? 'Movie' : 'TV Show'} Available: ${foundRequest.title}`,
                color: 0x48a9a6,
                timestamp: new Date().toISOString(),
                fields: [
                  {
                    name: 'Title',
                    value: foundRequest.title,
                    inline: true,
                  },
                  {
                    name: 'Type',
                    value:
                      foundRequest.media_type === 'movie' ? 'Movie' : 'TV Show',
                    inline: true,
                  },
                  {
                    name: 'Requested By',
                    value: foundRequest.user_name,
                    inline: true,
                  },
                ],
              },
            ],
          })
        }

        // Send Apprise notification
        if (fastify.config.enableApprise && fastify.config.systemAppriseUrl) {
          await fastify.apprise.sendSystemNotification({
            type: 'system',
            username: 'SeerrBridge',
            title: 'Media Available',
            embedFields: [
              {
                name: 'Title',
                value: foundRequest.title,
              },
              {
                name: 'Status',
                value: `${foundRequest.media_type === 'movie' ? 'Movie' : 'TV Show'} is now available`,
              },
            ],
          })
        }
      }

      return response
    },
  )
}

export default plugin
