import {
  ErrorSchema,
  SonarrInstanceCreateResponseSchema,
  SonarrInstanceListResponseSchema,
  SonarrInstanceSchema,
  SonarrInstanceUpdateSchema,
} from '@schemas/sonarr/sonarr-instance.schema.js'
import { handleArrInstanceError, logRouteError } from '@utils/route-errors.js'
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
      // Ensure all fields have defaults for legacy rows missing values
      return instances.map((instance) => ({
        ...instance,
        bypassIgnored: instance.bypassIgnored ?? false,
        seasonMonitoring: instance.seasonMonitoring ?? 'all',
        monitorNewItems: instance.monitorNewItems ?? 'all',
        searchOnAdd: instance.searchOnAdd ?? true,
        createSeasonFolders: instance.createSeasonFolders ?? false,
        seriesType: instance.seriesType ?? 'standard',
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
        summary: 'Create Sonarr instance',
        operationId: 'createSonarrInstance',
        description: 'Create a new Sonarr instance configuration',
        body: SonarrInstanceSchema,
        response: {
          201: SonarrInstanceCreateResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          500: ErrorSchema,
        },
        tags: ['Sonarr'],
      },
    },
    async (request, reply) => {
      try {
        const instanceData = request.body
        const id = await fastify.sonarrManager.addInstance(instanceData)
        reply.status(201)
        return { id }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error creating Sonarr instance',
          context: { service: 'sonarr' },
        })
        return handleArrInstanceError(error, reply, {
          service: 'sonarr',
          defaultMessage:
            'An unexpected error occurred while creating the instance',
        })
      }
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
        await fastify.sonarrManager.updateInstance(id, updates)
        reply.status(204)
        return
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Error updating instance',
          context: {
            service: 'sonarr',
            instanceId: id,
          },
        })
        return handleArrInstanceError(error, reply, {
          service: 'sonarr',
          defaultMessage:
            'An unexpected error occurred while updating the instance',
        })
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
          204: { type: 'null', description: 'No Content' },
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
        logRouteError(fastify.log, request, error, {
          message: 'Failed to delete Sonarr instance',
          instanceId: id,
        })
        return handleArrInstanceError(error, reply, {
          service: 'sonarr',
          defaultMessage:
            'An unexpected error occurred while deleting the instance',
        })
      }
    },
  )
}

export default plugin
