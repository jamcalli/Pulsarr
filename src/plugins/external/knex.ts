import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import knex, { Knex } from 'knex'

declare module 'fastify' {
  interface FastifyInstance {
    knex: Knex;
  }
}

// Move autoConfig here since it's specifically for Knex
export const autoConfig = (fastify: FastifyInstance) => {
  return {
    client: 'better-sqlite3',
    connection: {
      filename: fastify.config.DB_PATH
    },
    useNullAsDefault: true,
    pool: { 
      min: 1, 
      max: 1
    }
  }
}

export default fp(async (fastify: FastifyInstance, opts) => {
  const instance = knex(opts)
  
  fastify.decorate('knex', instance)
  
  fastify.addHook('onClose', async () => {
    await instance.destroy()
  })
}, { name: 'knex' })