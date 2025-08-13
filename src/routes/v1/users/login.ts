import {
  CredentialsSchema,
  LoginErrorSchema,
  LoginResponseSchema,
} from '@schemas/auth/login.js'
import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CredentialsSchema>
    Reply: z.infer<typeof LoginResponseSchema>
  }>(
    '/login',
    {
      schema: {
        summary: 'User login',
        operationId: 'loginUser',
        description: 'Authenticate user by email and password',
        body: CredentialsSchema,
        response: {
          200: LoginResponseSchema,
          401: LoginErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      try {
        const user = await fastify.db.getAdminUser(email)
        if (!user || !(await fastify.compare(password, user.password))) {
          return reply.unauthorized('Invalid email or password.')
        }

        request.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        }
        await request.session.save()

        const config = fastify.config
        const hasPlexTokens = Boolean(
          config?.plexTokens &&
            Array.isArray(config.plexTokens) &&
            config.plexTokens.length > 0,
        )

        return {
          success: true,
          message: 'Login successful',
          username: user.username,
          redirectTo: hasPlexTokens ? '/dashboard' : '/plex',
        }
      } catch (_error) {
        return reply.internalServerError('Login failed.')
      }
    },
  )
}

export default plugin
