import {
  CreateExclusionResponseSchema,
  CreateExclusionSchema,
  ExclusionErrorSchema,
  GetExclusionsResponseSchema,
  GetUserExclusionsParamsSchema,
  GetUserExclusionsResponseSchema,
  RemoveExclusionParamsSchema,
} from '@schemas/exclusions/exclusions.schema.js'
import { logRouteError } from '@utils/route-errors.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  // Create Exclusion
  fastify.post(
    '/exclusions',
    {
      schema: {
        summary: 'Create exclusion',
        operationId: 'createExclusion',
        description:
          'Create watchlist exclusion records for a key and set of users',
        body: CreateExclusionSchema,
        response: {
          201: CreateExclusionResponseSchema,
          400: ExclusionErrorSchema,
          500: ExclusionErrorSchema,
        },
        tags: ['Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const { key, userIds } = request.body
        const created = await fastify.db.excludeWatchlistItem(key, userIds)

        reply.status(201)
        return {
          success: true,
          message: `Created ${created} exclusion(s)`,
          created,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to create exclusion',
        })
        return reply.internalServerError('Failed to create exclusion')
      }
    },
  )

  // Get All Exclusions
  fastify.get(
    '/exclusions',
    {
      schema: {
        summary: 'Get all exclusions',
        operationId: 'getAllExclusions',
        description: 'Retrieve all watchlist exclusions with user information',
        response: {
          200: GetExclusionsResponseSchema,
          500: ExclusionErrorSchema,
        },
        tags: ['Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const exclusions = await fastify.db.getAllExclusions()

        return {
          success: true,
          message: 'Exclusions retrieved successfully',
          exclusions,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve exclusions',
        })
        return reply.internalServerError('Failed to retrieve exclusions')
      }
    },
  )

  // Get Exclusions for User
  fastify.get(
    '/exclusions/user/:userId',
    {
      schema: {
        summary: 'Get user exclusions',
        operationId: 'getUserExclusions',
        description: 'Retrieve all watchlist exclusions for a specific user',
        params: GetUserExclusionsParamsSchema,
        response: {
          200: GetUserExclusionsResponseSchema,
          500: ExclusionErrorSchema,
        },
        tags: ['Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const exclusions = await fastify.db.getExclusionsForUser(
          request.params.userId,
        )

        return {
          success: true,
          message: 'User exclusions retrieved successfully',
          exclusions,
        }
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to retrieve user exclusions',
        })
        return reply.internalServerError('Failed to retrieve user exclusions')
      }
    },
  )

  // Remove Exclusion
  fastify.delete(
    '/exclusions/:id',
    {
      schema: {
        summary: 'Remove exclusion',
        operationId: 'removeExclusion',
        description: 'Remove a watchlist exclusion by ID',
        params: RemoveExclusionParamsSchema,
        response: {
          204: { type: 'null', description: 'No Content' },
          404: ExclusionErrorSchema,
          500: ExclusionErrorSchema,
        },
        tags: ['Exclusions'],
      },
    },
    async (request, reply) => {
      try {
        const removed = await fastify.db.removeExclusion(request.params.id)

        if (!removed) {
          return reply.notFound('Exclusion not found')
        }

        reply.status(204)
        return
      } catch (error) {
        logRouteError(fastify.log, request, error, {
          message: 'Failed to remove exclusion',
        })
        return reply.internalServerError('Failed to remove exclusion')
      }
    },
  )
}

export default plugin
