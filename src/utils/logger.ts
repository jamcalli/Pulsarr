import type { LevelWithSilent } from 'pino'
import * as rfs from 'rotating-file-stream'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

export const validLogLevels: LevelWithSilent[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..', '..')

function getLogStream() {
  const logDirectory = resolve(projectRoot, 'data', 'logs')
  try {
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true })
    }
    return rfs.createStream('pulsarr-%Y-%m-%d.log', {
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
