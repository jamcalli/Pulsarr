import {
  ErrorSchema,
  RadarrInstanceCreateResponseSchema,
  RadarrInstanceListResponseSchema,
  RadarrInstanceSchema,
  RadarrInstanceUpdateSchema,
} from '@schemas/radarr/radarr-instance.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get all instances
  fastify.get(
    '/instances',
    {
      schema: {
        summary: 'Get Radarr instances',
        operationId: 'getRadarrInstances',
        description: 'Retrieve all configured Radarr instances',
        response: {
          200: RadarrInstanceListResponseSchema,
        },
        tags: ['Radarr'],
      },
    },
    async () => {
      const instances = await fastify.radarrManager.getAllInstances()
      // Ensure all fields have defaults for legacy rows missing values
      return instances.map((instance) => ({
        ...instance,
        bypassIgnored: instance.bypassIgnored ?? false,
        searchOnAdd: instance.searchOnAdd ?? true,
        minimumAvailability: instance.minimumAvailability ?? 'released',
        tags: (instance.tags ?? []).map((t) => t.toString()),
        isDefault: instance.isDefault ?? false,
      }))
    },
  )

  // Create instance
  fastify.post(
    '/instances',
    {
      schema: {
        summary: 'Create Radarr instance',
        operationId: 'createRadarrInstance',
        description: 'Create a new Radarr instance configuration',
        body: RadarrInstanceSchema,
        response: {
          201: RadarrInstanceCreateResponseSchema,
        },
        tags: ['Radarr'],
      },
    },
    async (request, reply) => {
      const instanceData = request.body
      const id = await fastify.radarrManager.addInstance(instanceData)
      reply.status(201)
      return { id }
    },
  )

  // Update instance
  fastify.put(
    '/instances/:id',
    {
      schema: {
        summary: 'Update Radarr instance',
        operationId: 'updateRadarrInstance',
        description: 'Update an existing Radarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        body: RadarrInstanceUpdateSchema,
        tags: ['Radarr'],
        response: {
          204: { type: 'null', description: 'No Content' },
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params
      const updates = request.body

      try {
        await fastify.radarrManager.updateInstance(id, updates)
        reply.status(204)
        return
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error updating instance',
          context: {
            service: 'radarr',
            instanceId: request.params.id,
          },
        })

        if (error instanceof Error) {
          // Clean up error message for user display
          const userMessage = error.message
            .replace(/Radarr API error: /, '')
            .replace(
              /Failed to initialize Radarr instance/,
              'Failed to save settings',
            )

          if (error.message.includes('Authentication')) {
            return reply.unauthorized(userMessage)
          }
          if (error.message.includes('not found')) {
            return reply.notFound(userMessage)
          }
          if (error.message.includes('default')) {
            return reply.badRequest(userMessage)
          }
          return reply.internalServerError(userMessage)
        }

        return reply.internalServerError(
          'An unexpected error occurred while updating the instance',
        )
      }
    },
  )

  // Delete instance
  fastify.delete(
    '/instances/:id',
    {
      schema: {
        summary: 'Delete Radarr instance',
        operationId: 'deleteRadarrInstance',
        description: 'Delete a Radarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        tags: ['Radarr'],
        response: {
          204: { type: 'null', description: 'No Content' },
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      try {
        await fastify.radarrManager.removeInstance(id)
        reply.status(204)
        return
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('not found')) {
            return reply.notFound(error.message)
          }
          return reply.internalServerError(error.message)
        }

        return reply.internalServerError(
          'An unknown error occurred when deleting the Radarr instance',
        )
      }
    },
  )
}

export default plugin
