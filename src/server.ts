import Fastify from 'fastify'
import fp from 'fastify-plugin'
import closeWithGrace from 'close-with-grace'
import serviceApp from './app.js'
import { createLoggerConfig, validLogLevels } from '@utils/logger.js'
import type { LevelWithSilent } from 'pino'

/**
 * Initializes and starts the Fastify server with configured plugins, logging, and graceful shutdown handling.
 *
 * Sets up JSON schema validation, logging level, and ensures persistent connections are forcibly closed during shutdown. Handles server startup errors by logging and terminating the process.
 */
async function init() {
  const app = Fastify({
    logger: createLoggerConfig(),
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
    pluginTimeout: 60000,
    // Force close persistent connections (like SSE) during shutdown
    forceCloseConnections: true,
  })

  await app.register(fp(serviceApp))
  await app.ready()

  const configLogLevel = app.config.logLevel
  if (
    configLogLevel &&
    validLogLevels.includes(configLogLevel as LevelWithSilent)
  ) {
    app.log.level = configLogLevel as LevelWithSilent
  }

  closeWithGrace(
    {
      delay: app.config.closeGraceDelay,
    },
    async ({ err }) => {
      if (err != null) {
        app.log.error(err)
      }
      await app.close()
    },
  )

  try {
    await app.listen({
      port: app.config.port,
      host: '0.0.0.0',
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()
