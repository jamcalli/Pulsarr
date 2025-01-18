import fp from 'fastify-plugin'
import env from '@fastify/env'
import type { FastifyInstance } from 'fastify'

interface Config {
  PORT: number
  DB_PATH: string
  COOKIE_SECRET: string
  COOKIE_NAME: string
  COOKIE_SECURED: boolean
  INITIAL_PLEX_TOKENS: string
  LOG_LEVEL: string
  CLOSE_GRACE_DELAY: number
  RATE_LIMIT_MAX: number
  plexTokens: string[]
  skipFriendSync: boolean
}

const schema = {
  type: 'object',
  required: ['PORT'],
  properties: {
    PORT: {
      type: 'number',
      default: 3003,
    },
    DB_PATH: {
      type: 'string',
      default: './data/db/plexwatchlist.db',
    },
    COOKIE_SECRET: {
      type: 'string',
      default: 'change-me-in-production',
    },
    COOKIE_NAME: {
      type: 'string',
      default: 'session',
    },
    COOKIE_SECURED: {
      type: 'boolean',
      default: false,
    },
    INITIAL_PLEX_TOKENS: {
      type: 'string',
      default: '[]',
    },
    SKIP_FRIEND_SYNC: {
      type: 'boolean',
      default: false,
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'silent',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    },
    CLOSE_GRACE_DELAY: {
      type: 'number',
      default: 500,
    },
    RATE_LIMIT_MAX: {
      type: 'number',
      default: 100,
    },
  },
}

declare module 'fastify' {
  export interface FastifyInstance {
    config: Config
    updateConfig(config: Partial<Config>): Promise<Config>
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(env, {
      confKey: 'config',
      schema,
      dotenv: true,
      data: process.env,
    })
  },
  { name: 'config' },
)
