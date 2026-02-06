import {
  CreateUserResponseSchema,
  CreateUserSchema,
  UpdateUserResponseSchema,
  UpdateUserSchema,
  UserErrorSchema,
} from '@schemas/users/users.schema.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'
import { z } from 'zod'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/users',
    {
      schema: {
        summary: 'Create user',
        operationId: 'createUser',
        description: 'Create a new user with the provided information',
        body: CreateUserSchema,
        response: {
          201: CreateUserResponseSchema,
          409: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const existingUser = await fastify.db.getUser(request.body.name)
        if (existingUser) {
          return reply.conflict('User with this name already exists')
        }

        const user = await fastify.db.createUser(request.body)

        reply.status(201)
        return {
          success: true,
          message: 'User created successfully',
          user: {
            id: user.id,
            name: user.name,
            apprise: user.apprise,
            alias: user.alias,
            discord_id: user.discord_id,
            notify_apprise: user.notify_apprise ?? false,
            notify_discord: user.notify_discord ?? false,
            notify_discord_mention: user.notify_discord_mention ?? true,
            notify_tautulli: user.notify_tautulli ?? false,
            tautulli_notifier_id: user.tautulli_notifier_id,
            can_sync: user.can_sync ?? true,
            requires_approval: user.requires_approval ?? false,
            plex_uuid: user.plex_uuid ?? null,
            avatar: user.avatar ?? null,
            display_name: user.display_name ?? null,
            friend_created_at: user.friend_created_at ?? null,
            created_at: user.created_at ?? new Date().toISOString(),
            updated_at: user.updated_at ?? new Date().toISOString(),
          },
        }
      } catch (_error) {
        return reply.internalServerError('Failed to create user')
      }
    },
  )

  fastify.patch(
    '/users/:id',
    {
      schema: {
        summary: 'Update user',
        operationId: 'updateUser',
        description: 'Update an existing user by ID',
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        body: UpdateUserSchema,
        response: {
          200: UpdateUserResponseSchema,
          404: UserErrorSchema,
          409: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      const userId = request.params.id

      try {
        const existingUser = await fastify.db.getUser(userId)
        if (!existingUser) {
          return reply.notFound('User not found')
        }

        if (request.body.name && request.body.name !== existingUser.name) {
          const nameExists = await fastify.db.getUser(request.body.name)
          if (nameExists) {
            return reply.conflict('User with this name already exists')
          }
        }

        const updated = await fastify.db.updateUser(userId, request.body)
        if (!updated) {
          throw new Error('Failed to update user')
        }

        const updatedUser = await fastify.db.getUser(userId)
        if (!updatedUser) {
          throw new Error('Failed to fetch updated user')
        }

        return {
          success: true,
          message: 'User updated successfully',
          user: {
            id: updatedUser.id,
            name: updatedUser.name,
            apprise: updatedUser.apprise,
            alias: updatedUser.alias,
            discord_id: updatedUser.discord_id,
            notify_apprise: updatedUser.notify_apprise ?? false,
            notify_discord: updatedUser.notify_discord ?? false,
            notify_discord_mention: updatedUser.notify_discord_mention ?? true,
            notify_tautulli: updatedUser.notify_tautulli ?? false,
            tautulli_notifier_id: updatedUser.tautulli_notifier_id,
            can_sync: updatedUser.can_sync ?? true,
            requires_approval: updatedUser.requires_approval ?? false,
            plex_uuid: updatedUser.plex_uuid ?? null,
            avatar: updatedUser.avatar ?? null,
            display_name: updatedUser.display_name ?? null,
            friend_created_at: updatedUser.friend_created_at ?? null,
            created_at: updatedUser.created_at ?? new Date().toISOString(),
            updated_at: updatedUser.updated_at ?? new Date().toISOString(),
          },
        }
      } catch (_error) {
        return reply.internalServerError('Failed to update user')
      }
    },
  )

  fastify.get(
    '/users/:id',
    {
      schema: {
        summary: 'Get user by ID',
        operationId: 'getUserById',
        description: 'Retrieve a specific user by their ID',
        params: z.object({
          id: z.coerce.number().int().positive(),
        }),
        response: {
          200: CreateUserResponseSchema,
          404: UserErrorSchema,
        },
        tags: ['Users'],
      },
    },
    async (request, reply) => {
      try {
        const user = await fastify.db.getUser(request.params.id)
        if (!user) {
          return reply.notFound('User not found')
        }

        return {
          success: true,
          message: 'User retrieved successfully',
          user: {
            id: user.id,
            name: user.name,
            apprise: user.apprise,
            alias: user.alias,
            discord_id: user.discord_id,
            notify_apprise: user.notify_apprise ?? false,
            notify_discord: user.notify_discord ?? false,
            notify_discord_mention: user.notify_discord_mention ?? true,
            notify_tautulli: user.notify_tautulli ?? false,
            tautulli_notifier_id: user.tautulli_notifier_id,
            can_sync: user.can_sync ?? true,
            requires_approval: user.requires_approval ?? false,
            plex_uuid: user.plex_uuid ?? null,
            avatar: user.avatar ?? null,
            display_name: user.display_name ?? null,
            friend_created_at: user.friend_created_at ?? null,
            created_at: user.created_at ?? new Date().toISOString(),
            updated_at: user.updated_at ?? new Date().toISOString(),
          },
        }
      } catch (_error) {
        return reply.internalServerError('Failed to retrieve user')
      }
    },
  )
}

export default plugin
