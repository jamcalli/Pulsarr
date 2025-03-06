import type { FastifyPluginAsync } from 'fastify'
import type { z } from 'zod'
import {
  LoginResponseSchema,
  LoginErrorSchema,
  CredentialsSchema,
} from '@schemas/auth/login.js'

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: z.infer<typeof CredentialsSchema>
    Reply: z.infer<typeof LoginResponseSchema>
  }>(
    '/login',
    {
      schema: {
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
          reply.status(401)
          return {
            success: false,
            message: 'Invalid email or password.',
            username: '',
          }
        }

        request.session.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        }
        await request.session.save()

        const config = await fastify.db.getConfig(1)
        const hasPlexTokens = Boolean(
          config?.plexTokens &&
            Array.isArray(config.plexTokens) &&
            config.plexTokens.length > 0,
        )

        return {
          success: true,
          message: 'Login successful',
          username: user.username,
          redirectTo: hasPlexTokens ? '/app/dashboard' : '/app/plex',
        }
      } catch (error) {
        throw reply.internalServerError('Login failed.')
      }
    },
  )
}

export default plugin
