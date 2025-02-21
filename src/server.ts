import Fastify from 'fastify'
import fp from 'fastify-plugin'
import closeWithGrace from 'close-with-grace'
import serviceApp from './app.js'
import type { LevelWithSilent } from 'pino'
import * as rfs from 'rotating-file-stream'
import fs from 'node:fs'
import { resolve } from 'node:path'

function getLogStream() {
  const logDirectory = resolve(import.meta.dirname, 'data/logs')
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory)
  }
  return rfs.createStream('app.log', {
    size: '10M',
    interval: '1d',
    path: logDirectory,
    compress: 'gzip',
    maxFiles: 7,
  })
}

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
  return {
    level: 'info',
  }
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
    logger: process.stdout.isTTY
      ? getLoggerOptions()
      : Object.assign(getLoggerOptions(), { stream: getLogStream() }),
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
      host: '0.0.0.0',
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()
