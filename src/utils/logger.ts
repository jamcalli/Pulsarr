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
 * Returns a serializer function for Fastify requests that redacts sensitive query parameters from the URL.
 *
 * The serializer extracts the HTTP method, URL, host, remote address, and remote port from the request, replacing the values of sensitive query parameters (`apiKey`, `password`, `token`, `plexToken`, `X-Plex-Token`) in the URL with `[REDACTED]`.
 *
 * @returns A function that serializes a Fastify request with sensitive query parameters redacted from the URL.
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
 * Generates a log filename using the given date and optional index.
 *
 * If no date or timestamp is provided, returns 'pulsarr-current.log'. Otherwise, formats the filename as 'pulsarr-YYYY-MM-DD[-index].log'.
 *
 * @param time - The date or timestamp for the log filename. If falsy, returns the default current log filename.
 * @param index - Optional index to append for rotated log files.
 * @returns The generated log filename.
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

/**
 * Creates and returns a rotating file stream for logging, ensuring the log directory exists.
 *
 * If the log directory cannot be created or accessed, falls back to standard output.
 *
 * @returns A rotating file stream for logs, or {@link process.stdout} if setup fails.
 */
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
 * Returns logger options for terminal output with human-readable formatting and redacted sensitive request data.
 *
 * The configuration uses the 'info' log level, formats logs with `pino-pretty`, and applies a request serializer that redacts sensitive query parameters from logged Fastify requests.
 */
function getTerminalOptions(): LoggerOptions {
  return {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        colorize: true, // Force colors even in Docker
      },
    },
    serializers: {
      req: createRequestSerializer(),
    },
  }
}

/**
 * Creates logger options for writing logs to a rotating file stream with sensitive query parameters redacted from request logs.
 *
 * @returns Logger options suitable for file-based logging with redacted request serialization.
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
 * Determines the log output destination based on command line arguments.
 *
 * Checks for `--log-terminal`, `--log-file`, or `--log-both` flags in the process arguments and returns the corresponding log destination. Defaults to `'terminal'` if no relevant flag is found.
 *
 * @returns The selected log destination: `'terminal'`, `'file'`, or `'both'`.
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
 * Creates a logger configuration for terminal, file, or both destinations, with request serialization and sensitive data redaction.
 *
 * Determines the logging destination from the provided argument or command line flags, and configures the logger accordingly. Supports simultaneous logging to terminal and file with appropriate serializers to redact sensitive query parameters in logged requests.
 *
 * @param destination - Optional log destination; if omitted, the destination is inferred from command line arguments.
 * @returns Logger configuration options for initializing a logger with the specified output destination(s).
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
          colorize: true, // Force colors even in Docker
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
