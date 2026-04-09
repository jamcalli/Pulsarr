import { createLoggerConfig, validLogLevels } from '@utils/logger.js'
import { normalizeBasePath } from '@utils/url.js'
import closeWithGrace from 'close-with-grace'
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import type { LevelWithSilent } from 'pino'
import serviceApp from './app.js'

async function init() {
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
    disableRequestLogging: !enableRequestLogging,
    // Trust X-Forwarded-For from private networks so request.ip resolves to
    // the real client behind a reverse proxy (needed for auth bypass, rate
    // limiting, and logging). Uses proxy-addr presets for RFC1918 + loopback.
    trustProxy: 'loopback,linklocal,uniquelocal',
  })

  const basePath = normalizeBasePath(process.env.basePath)
  if (basePath !== '/') {
    await app.register(fp(serviceApp), { prefix: basePath })
  } else {
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
