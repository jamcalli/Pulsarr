import Fastify from 'fastify'
import fp from 'fastify-plugin'
import closeWithGrace from 'close-with-grace'
import serviceApp from './app.js'
import type { LevelWithSilent } from 'pino'

function getLoggerOptions() {
  if (process.stdout.isTTY) {
    return {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    }
  }
  return { level: 'silent' }
}

const validLogLevels: LevelWithSilent[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]

async function init() {
  const app = Fastify({
    logger: getLoggerOptions(),
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
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
      host: '127.0.0.1',
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()
