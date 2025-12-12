import {
  CredentialsSchema,
  LoginErrorSchema,
  LoginResponseSchema,
} from '@schemas/auth/login.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.post(
    '/login',
    {
      schema: {
        security: [],
        summary: 'User login',
        operationId: 'loginUser',
        description: 'Authenticate user by email and password',
        body: CredentialsSchema,
        response: {
          200: LoginResponseSchema,
          401: LoginErrorSchema,
          500: LoginErrorSchema,
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

        // Client-side router handles basePath automatically
        const redirectTo = hasPlexTokens ? '/dashboard' : '/plex'

        return {
          success: true,
          message: 'Login successful',
          username: user.username,
          redirectTo,
        }
      } catch (error) {
        fastify.log.error({ err: error, email }, 'Login failed')
        return reply.internalServerError('Login failed.')
      }
    },
  )
}

export default plugin
