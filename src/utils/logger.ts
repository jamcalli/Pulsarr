import type { LevelWithSilent, LoggerOptions } from 'pino'
import * as rfs from 'rotating-file-stream'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import pino from 'pino'
import type { FastifyRequest } from 'fastify'

export const validLogLevels: LevelWithSilent[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]

export type LogDestination = 'terminal' | 'file' | 'both'

interface FileLoggerOptions extends LoggerOptions {
  stream: rfs.RotatingFileStream | NodeJS.WriteStream
}

interface MultiStreamLoggerOptions {
  level: string
  stream: pino.MultiStreamRes
}

type PulsarrLoggerOptions =
  | LoggerOptions
  | FileLoggerOptions
  | MultiStreamLoggerOptions

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..', '..')

/**
 * Request serializer that redacts sensitive data
 */
function createRequestSerializer() {
  return (req: FastifyRequest) => {
    // Get the default serialization
    const serialized = {
      method: req.method,
      url: req.url,
      host: req.headers.host as string | undefined,
      remoteAddress: req.ip,
      remotePort: req.socket.remotePort,
    }

    // Sanitize the URL
    if (serialized.url) {
      serialized.url = serialized.url
        .replace(/([?&])apiKey=([^&]+)/gi, '$1apiKey=[REDACTED]')
        .replace(/([?&])password=([^&]+)/gi, '$1password=[REDACTED]')
        .replace(/([?&])token=([^&]+)/gi, '$1token=[REDACTED]')
        .replace(/([?&])plexToken=([^&]+)/gi, '$1plexToken=[REDACTED]')
        .replace(/([?&])X-Plex-Token=([^&]+)/gi, '$1X-Plex-Token=[REDACTED]')
    }

    return serialized
  }
}

function filename(time: number | Date, index?: number): string {
  if (!time) return 'pulsarr-current.log'
  const date = typeof time === 'number' ? new Date(time) : time
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const indexStr = index ? `-${index}` : ''
  return `pulsarr-${year}-${month}-${day}${indexStr}.log`
}

function getFileStream(): rfs.RotatingFileStream | NodeJS.WriteStream {
  const logDirectory = resolve(projectRoot, 'data', 'logs')
  try {
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory, { recursive: true })
    }
    return rfs.createStream(filename, {
      size: '10M',
      path: logDirectory,
      compress: 'gzip',
      maxFiles: 7,
    })
  } catch (err) {
    console.error('Failed to setup log directory:', err)
    return process.stdout
  }
}

function getTerminalOptions(): LoggerOptions {
  return {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
    serializers: {
      req: createRequestSerializer(),
    },
  }
}

function getFileOptions(): FileLoggerOptions {
  return {
    level: 'info',
    stream: getFileStream(),
    serializers: {
      req: createRequestSerializer(),
    },
  }
}

/**
 * Parse command line arguments to determine log destination
 * @returns The log destination from command line args or default
 */
export function parseLogDestinationFromArgs(): LogDestination {
  const args = process.argv.slice(2)

  if (args.includes('--log-terminal')) return 'terminal'
  if (args.includes('--log-file')) return 'file'
  if (args.includes('--log-both')) return 'both'

  // Default destination if no argument is found
  return 'terminal'
}

/**
 * Create logger configuration with specified destination or
 * automatically detect from command line arguments
 * @param destination Optional explicit destination, overrides command line args
 * @returns Logger configuration object
 */
export function createLoggerConfig(
  destination?: LogDestination,
): PulsarrLoggerOptions {
  // If no destination provided, try to get it from command line args
  const logDestination = destination || parseLogDestinationFromArgs()

  console.log(`Setting up logger with destination: ${logDestination}`)

  switch (logDestination) {
    case 'terminal':
      return getTerminalOptions()
    case 'file':
      return getFileOptions()
    case 'both': {
      // Use pino's built-in multistream
      const fileStream = getFileStream()

      // Create a pretty stream for terminal output
      const prettyStream = pino.transport({
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      })

      const multistream = pino.multistream([
        { stream: prettyStream },
        { stream: fileStream },
      ])

      return {
        level: 'info',
        stream: multistream,
        serializers: {
          req: createRequestSerializer(),
        },
      }
    }
    default:
      return getTerminalOptions()
  }
}
