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
 * Creates a serializer function for Fastify requests that redacts sensitive query parameters from the URL.
 *
 * The serializer extracts the HTTP method, URL, host, remote address, and remote port from the request. It replaces the values of sensitive query parameters (`apiKey`, `password`, `token`, `plexToken`, `X-Plex-Token`) in the URL with `[REDACTED]` to prevent logging confidential information.
 *
 * @returns A function that serializes a Fastify request with sensitive data redacted from the URL.
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

/**
 * Generates a log filename based on the provided date and optional index.
 *
 * @param time - The date or timestamp to use for the filename. If falsy, returns the default current log filename.
 * @param index - Optional index to append for rotated log files.
 * @returns The generated log filename in the format 'pulsarr-YYYY-MM-DD[-index].log', or 'pulsarr-current.log' if no time is provided.
 */
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

/**
 * Returns logger options configured for terminal output with human-readable formatting.
 *
 * The configuration uses the 'info' log level, formats logs with `pino-pretty`, and applies a request serializer that redacts sensitive query parameters from logged requests.
 */
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

/**
 * Returns logger options configured for file output with log level 'info'.
 *
 * The logger writes to a rotating file stream and uses a request serializer that redacts sensitive query parameters from logged requests.
 *
 * @returns File logger options for use with the pino logger.
 */
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
 * Generates a logger configuration object for the specified log destination.
 *
 * If no destination is provided, the log destination is determined from command line arguments.
 * Supports terminal, file, or combined logging with appropriate serializers and streams.
 *
 * @param destination - Optional log destination; overrides command line arguments if specified.
 * @returns A logger configuration object suitable for initializing a logger.
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
