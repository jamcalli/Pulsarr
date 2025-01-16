import fp from 'fastify-plugin'
import env from '@fastify/env'
import type { FastifyInstance } from 'fastify'

// Separate environment config type from user config type
interface EnvConfig {
  PORT: number;
  DB_PATH: string;
  COOKIE_SECRET: string;
  COOKIE_NAME: string;
  COOKIE_SECURED: boolean;
  INITIAL_PLEX_TOKENS?: string;
  LOG_LEVEL?: string;
  CLOSE_GRACE_DELAY?: number;
}

// User configurable settings
interface UserConfig {
  plexTokens: string[];
  skipFriendSync?: boolean;
}

declare module 'fastify' {
  export interface FastifyInstance {
    config: EnvConfig & {
      userConfig: UserConfig;
    };
    updateUserConfig(config: Partial<UserConfig>): Promise<UserConfig>;
  }
}

const schema = {
  type: 'object',
  required: ['PORT'],
  properties: {
    PORT: {
      type: 'number',
      default: 3003
    },
    DB_PATH: {
      type: 'string',
      default: './data/db/plexwatchlist.db'
    },
    COOKIE_SECRET: {
      type: 'string',
      default: 'change-me-in-production'
    },
    COOKIE_NAME: {
      type: 'string',
      default: 'session'
    },
    COOKIE_SECURED: {
      type: 'boolean',
      default: false
    },
    INITIAL_PLEX_TOKENS: {
      type: 'string',
      default: '[]'
    },
    SKIP_FRIEND_SYNC: {
      type: 'boolean',
      default: false
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'silent',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
    },
    CLOSE_GRACE_DELAY: {
      type: 'number',
      default: 500
    }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  await fastify.register(env, {
    confKey: 'config',
    schema,
    dotenv: true,
    data: process.env
  })

  let initialTokens: string[] = [];
  if (fastify.config.INITIAL_PLEX_TOKENS) {
    try {
      const parsed = JSON.parse(fastify.config.INITIAL_PLEX_TOKENS);
      if (Array.isArray(parsed)) {
        initialTokens = parsed.filter((token): token is string => 
          typeof token === 'string' && token.length > 0
        );
      } else {
        fastify.log.warn('INITIAL_PLEX_TOKENS must be an array of strings');
      }
    } catch (error) {
      fastify.log.warn('Failed to parse INITIAL_PLEX_TOKENS, using empty array');
    }
  }

  fastify.config.userConfig = {
    plexTokens: initialTokens
  }
}, { name: 'config' })