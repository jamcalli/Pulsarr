import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { LoginResponseSchema, LoginErrorSchema, CredentialsSchema } from '@schemas/auth/login.js'

const plugin: FastifyPluginAsync = async (fastify) => {
    fastify.post<{
      Body: z.infer<typeof CredentialsSchema>,
      Reply: z.infer<typeof LoginResponseSchema>
    }>(
      '/login',
      {
        schema: {
          body: CredentialsSchema,
          response: {
            200: LoginResponseSchema,
            401: LoginErrorSchema
          },
          tags: ['Authentication']
        }
      },
      async function (request, reply) {
        const { username, password } = request.body
      
        try {
          const user = await fastify.db.getAdminUser(username)
          if (!user || !await fastify.compare(password, user.password)) {
            reply.status(401)
            return { success: false, message: 'Invalid username or password.' }
          }
      
          request.session.user = {
            id: user.id,
            username,
            role: user.role
          }
          await request.session.save()
          return { success: true }
        } catch (error) {
          throw reply.internalServerError('Login failed.')
        }
      }
    )
   }

export default plugin