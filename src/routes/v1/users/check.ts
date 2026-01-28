import { AuthCheckResponseSchema } from '@schemas/auth/check.js'
import { ErrorSchema } from '@schemas/common/error.schema.js'
import type { FastifyPluginAsyncZodOpenApi } from 'fastify-zod-openapi'

const plugin: FastifyPluginAsyncZodOpenApi = async (fastify) => {
  fastify.get(
    '/check',
    {
      schema: {
        summary: 'Check authentication status',
        operationId: 'checkAuth',
        description:
          'Lightweight endpoint to verify the current session is authenticated',
        response: {
          200: AuthCheckResponseSchema,
          401: ErrorSchema,
        },
        tags: ['Authentication'],
      },
    },
    async () => {
      // Auth already verified by autohooks middleware
      return { authenticated: true } as const
    },
  )
}

export default plugin
