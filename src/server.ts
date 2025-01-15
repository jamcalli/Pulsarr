import Fastify from 'fastify'
import fp from 'fastify-plugin'
import closeWithGrace from 'close-with-grace'
import serviceApp from './app.js'
import { getConfig } from '@shared/config/config-manager.js'

function getLoggerOptions() {
  if (process.stdout.isTTY) {
    return {
      transport: {
        target: '@fastify/one-line-logger'
      }
    }
  }
  return { level: process.env.LOG_LEVEL ?? 'silent' }
}

async function init() {
  const app = Fastify({
    logger: getLoggerOptions(),
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all'
      }
    }
  })

  // Register the application as a plugin
  app.register(fp(serviceApp))

  const graceDelay = process.env.FASTIFY_CLOSE_GRACE_DELAY 
    ? Number(process.env.FASTIFY_CLOSE_GRACE_DELAY)
    : 500;

  if (isNaN(graceDelay)) {
    app.log.warn(`Invalid FASTIFY_CLOSE_GRACE_DELAY value: ${process.env.FASTIFY_CLOSE_GRACE_DELAY}, using default of 500ms`);
  }

  closeWithGrace(
    { 
      delay: isNaN(graceDelay) ? 500 : graceDelay 
    },
    async ({ err }) => {
      if (err != null) {
        app.log.error(err)
      }
      await app.close()
    }
  )

  await app.ready()

  try {
    const config = getConfig(app.log)
    await app.listen({ 
      port: config.port ?? 3000, 
      host: '127.0.0.1' 
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()