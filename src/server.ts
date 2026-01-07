import { createLoggerConfig, validLogLevels } from '@utils/logger.js'
import { normalizeBasePath } from '@utils/url.js'
import closeWithGrace from 'close-with-grace'
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import type { LevelWithSilent } from 'pino'
import serviceApp from './app.js'

/**
 * Create, configure, and start the Fastify HTTP server for the application.
 *
 * Initializes Fastify with schema validation, logger configuration, plugin registration, and application-configured log level; sets up graceful shutdown (forcibly closing persistent connections) and begins listening on the configured port. Request logging is disabled by default but can be enabled via the environment variable `enableRequestLogging` (case-insensitive truthy values: "true", "1", "yes", "on"). If the server fails to start, the error is logged and the process exits with code 1.
 */
async function init() {
  // Read request logging setting from env var (default: false)
  // Accept common truthy variants: true, 1, yes, on (case-insensitive)
  const enableRequestLogging = /^(\s*(true|1|yes|on)\s*)$/i.test(
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

  // Register the app with optional base path prefix
  const basePath = normalizeBasePath(process.env.basePath)
  if (basePath !== '/') {
    // Register app under a prefix
    await app.register(fp(serviceApp), { prefix: basePath })
  } else {
    // Register app at root
    await app.register(fp(serviceApp))
  }

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
      logger: app.log,
    },
    async ({ signal, err }) => {
      if (err) {
        app.log.error({ err }, 'server closing with error')
      } else {
        app.log.info(`${signal} received, server closing`)
      }
      await app.close()
    },
  )

  try {
    // listenPort: internal port the server binds to (default 3003)
    // port: external port for webhook URL generation (what Sonarr/Radarr use to reach Pulsarr)
    // Docker users should use port mapping (e.g., 8080:3003) and set port=8080 for webhooks
    await app.listen({
      port: app.config.listenPort,
      host: '0.0.0.0',
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()
