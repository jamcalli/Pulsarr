import fp from 'fastify-plugin'
import { fastifySchedule } from '@fastify/schedule'
import type { FastifyInstance } from 'fastify'
import { ToadScheduler } from 'toad-scheduler'

declare module 'fastify' {
  interface FastifyInstance {
    scheduler: ToadScheduler
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(fastifySchedule)
  },
  {
    name: 'scheduler',
  },
)