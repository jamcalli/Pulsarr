import {
  ErrorSchema,
  NoContentSchema,
  SonarrInstanceCreateResponseSchema,
  SonarrInstanceListResponseSchema,
  SonarrInstanceSchema,
  SonarrInstanceUpdateSchema,
} from '@schemas/sonarr/sonarr-instance.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Get all instances
  fastify.get(
    '/instances',
    {
      schema: {
        summary: 'Get Sonarr instances',
        operationId: 'getSonarrInstances',
        description: 'Retrieve all configured Sonarr instances',
        response: {
          200: SonarrInstanceListResponseSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async () => {
      const instances = await fastify.sonarrManager.getAllInstances()
      // Ensure searchOnAdd and seriesType are defined for all instances
      return instances.map((instance) => ({
        ...instance,
        searchOnAdd: instance.searchOnAdd ?? true,
        createSeasonFolders: instance.createSeasonFolders ?? false,
        seriesType: instance.seriesType ?? 'standard',
        tags: (instance.tags ?? []).map((t) => t.toString()),
      }))
    },
  )

  // Create instance
  fastify.post(
    '/instances',
    {
      schema: {
        summary: 'Create Sonarr instance',
        operationId: 'createSonarrInstance',
        description: 'Create a new Sonarr instance configuration',
        body: SonarrInstanceSchema,
        response: {
          201: SonarrInstanceCreateResponseSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      const instanceData = request.body
      const id = await fastify.sonarrManager.addInstance(instanceData)

      reply.status(201)
      return { id }
    },
  )

  // Update instance
  fastify.put(
    '/instances/:id',
    {
      schema: {
        summary: 'Update Sonarr instance',
        operationId: 'updateSonarrInstance',
        description: 'Update an existing Sonarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        body: SonarrInstanceUpdateSchema,
        tags: ['Sonarr'],
        response: {
          204: NoContentSchema,
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
        await fastify.sonarrManager.updateInstance(id, updates)
        reply.status(204)
        return
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error updating instance',
          context: {
            service: 'sonarr',
            instanceId: request.params.id,
          },
        })

        if (error instanceof Error) {
          // Clean up error message for user display
          const userMessage = error.message
            .replace(/Sonarr API error: /, '')
            .replace(
              /Failed to initialize Sonarr instance/,
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
        summary: 'Delete Sonarr instance',
        operationId: 'deleteSonarrInstance',
        description: 'Delete a Sonarr instance configuration',
        params: z.object({ id: z.coerce.number() }),
        tags: ['Sonarr'],
        response: {
          204: NoContentSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params

      try {
        await fastify.sonarrManager.removeInstance(id)
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
          'An unknown error occurred when deleting the Sonarr instance',
        )
      }
    },
  )
}

export default plugin
