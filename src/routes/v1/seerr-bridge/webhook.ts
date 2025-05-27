import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import { seerrBridgeCompletionSchema } from '@schemas/seerr-bridge/seerr-bridge.schema.js'

/**
 * SeerrBridge webhook endpoint
 * Receives completion notifications from SeerrBridge when media is available
 */
const seerrBridgeWebhook: FastifyPluginAsync = async (fastify) => {
  // Main webhook endpoint - receives completion from SeerrBridge
  fastify.post(
    '/webhook',
    {
      schema: {
        summary: 'Receive SeerrBridge completion webhook',
        description:
          'Endpoint for SeerrBridge to notify when media is available',
        tags: ['seerr-bridge'],
        body: seerrBridgeCompletionSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = request.body as z.infer<
          typeof seerrBridgeCompletionSchema
        >

        fastify.log.info({
          msg: 'Received SeerrBridge webhook',
          payload,
        })

        // Extract the request ID
        const { request_id } = payload.request

        // Look up the original request in our database
        const originalRequest =
          await fastify.db.getSeerrBridgeRequestById(request_id)

        if (!originalRequest) {
          fastify.log.warn({
            msg: 'Received webhook for unknown request',
            request_id,
          })
          return reply.code(400).send({
            status: 'error',
            message: 'Unknown request ID',
          })
        }

        // Update the request status based on the event
        let newStatus: 'completed' | 'failed' = 'completed'
        if (payload.event === 'media.failed') {
          newStatus = 'failed'
        }

        await fastify.db.updateSeerrBridgeRequestStatus(request_id, newStatus)

        // Send notifications if the media is available
        if (payload.event === 'media.available') {
          const systemNotificationMessage = `🎬 ${payload.media.media_type === 'movie' ? 'Movie' : 'TV Show'} Available: ${payload.media.title || originalRequest.title}`

          // Discord webhook notification
          if (fastify.config.discordWebhookUrl) {
            const webhookPayload = {
              content: undefined,
              embeds: [
                {
                  title: 'SeerrBridge Media Available',
                  description: systemNotificationMessage,
                  color: 0x48a9a6, // Teal color
                  timestamp: new Date().toISOString(),
                  fields: [
                    {
                      name: 'Type',
                      value:
                        payload.media.media_type === 'movie'
                          ? 'Movie'
                          : 'TV Show',
                      inline: true,
                    },
                    {
                      name: 'Title',
                      value: payload.media.title || originalRequest.title,
                      inline: true,
                    },
                    {
                      name: 'Requested By',
                      value: originalRequest.user_name,
                      inline: true,
                    },
                    ...(payload.media.imdbId
                      ? [
                          {
                            name: 'IMDb ID',
                            value: payload.media.imdbId,
                            inline: true,
                          },
                        ]
                      : []),
                  ],
                },
              ],
            }

            await fastify.discord.sendNotification(webhookPayload)
          }

          // Apprise system notification
          if (fastify.config.enableApprise && fastify.config.systemAppriseUrl) {
            await fastify.apprise.sendSystemNotification({
              type: 'system',
              username: 'SeerrBridge',
              title: 'SeerrBridge Media Available',
              embedFields: [
                {
                  name: 'Status',
                  value: systemNotificationMessage,
                },
                {
                  name: 'Requested By',
                  value: originalRequest.user_name,
                },
              ],
            })
          }
        }

        return reply.code(200).send({
          status: 'success',
          message: 'Webhook processed successfully',
        })
      } catch (error) {
        fastify.log.error({
          msg: 'Error processing SeerrBridge webhook',
          error,
        })

        return reply.code(400).send({
          status: 'error',
          message: 'Failed to process webhook',
        })
      }
    },
  )
}

export default seerrBridgeWebhook
