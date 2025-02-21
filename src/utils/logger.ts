import type { LevelWithSilent } from 'pino'
import * as rfs from 'rotating-file-stream'
import fs from 'node:fs'
import { resolve } from 'node:path'

export const validLogLevels: LevelWithSilent[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]

function getLogStream() {
  const logDirectory = resolve(process.cwd(), 'data', 'logs')
  try {
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true })
    }
    return rfs.createStream('app.log', {
      size: '10M',
      interval: '1d',
      path: logDirectory,
      compress: 'gzip',
      maxFiles: 7,
    })
  } catch (err) {
    console.error('Failed to setup log directory:', err)
    return process.stdout
  }
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

export function createLoggerConfig() {
  return process.stdout.isTTY
    ? getLoggerOptions()
    : Object.assign(getLoggerOptions(), { stream: getLogStream() })
}