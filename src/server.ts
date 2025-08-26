import { createLoggerConfig, validLogLevels } from '@utils/logger.js'
import closeWithGrace from 'close-with-grace'
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import type { LevelWithSilent } from 'pino'
import serviceApp from './app.js'

/**
 * Create, configure, and start the Fastify HTTP server for the application.
 *
 * Initializes Fastify with schema validation, logger configuration, plugin registration, and application-configured log level; sets up graceful shutdown (forcibly closing persistent connections) and begins listening on the configured port. Request logging is enabled by default but can be disabled via the environment variable `enableRequestLogging` (case-insensitive falsy values: "false", "0", "no", "off"). If the server fails to start, the error is logged and the process exits with code 1.
 */
async function init() {
  // Read request logging setting from env var (default: true)
  // Accept common falsy variants: false, 0, no, off (case-insensitive)
  const enableRequestLogging = !/^(\s*(false|0|no|off)\s*)$/i.test(
    process.env.enableRequestLogging ?? '',
  )

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
    // Control request logging based on env var
    disableRequestLogging: !enableRequestLogging,
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
