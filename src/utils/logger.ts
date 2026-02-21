import fs from 'node:fs'
import { resolveEnvPath, resolveLogPath } from '@utils/data-dir.js'
import { config } from 'dotenv'
import type { FastifyBaseLogger, FastifyRequest } from 'fastify'
import type { DestinationStream, LevelWithSilent, LoggerOptions } from 'pino'
import pino from 'pino'
import pretty from 'pino-pretty'
import * as rfs from 'rotating-file-stream'

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

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const PINO_LEVEL_TO_NAME: Record<number, LogLevel> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
}

const MODULE_PREFIX_REGEX = /^\[([A-Z0-9_]+)\]\s*/

const PRETTY_OPTIONS = {
  translateTime: 'SYS:yyyy-mm-dd HH:MM:ss Z',
  ignore: 'pid,hostname',
} as const

/**
 * Maps a pino numeric level to a LogLevel string.
 * Falls back to 'info' for unknown levels.
 */
export function pinoLevelToName(level: number): LogLevel {
  return PINO_LEVEL_TO_NAME[level] ?? 'info'
}

/**
 * Extracts a `[SERVICE_NAME]` prefix from a pino msg field
 * (set by `createServiceLogger`'s `msgPrefix`).
 *
 * @returns The uppercased module name and the remaining clean message.
 */
export function parseModuleFromMsg(msg: string): {
  module: string | undefined
  message: string
} {
  const match = MODULE_PREFIX_REGEX.exec(msg)
  if (match) {
    return { module: match[1], message: msg.slice(match[0].length) }
  }
  return { module: undefined, message: msg }
}

// Load .env file early for logger configuration
// Resolve data directory deterministically from platform (Windows/macOS)
// or fall back to project-relative paths (Linux/Docker)
config({ path: resolveEnvPath(), quiet: true })

/**
 * Creates a custom error serializer that handles both standard errors and custom HttpError objects.
 *
 * @returns A function that properly serializes error objects with message, stack, name, and custom properties.
 */
function createErrorSerializer() {
  return (err: Error | Record<string, unknown> | string | number | boolean) => {
    if (err == null) {
      return err
    }

    // Handle primitive values (string, number, boolean)
    if (typeof err !== 'object') {
      const primitiveType =
        typeof err === 'string'
          ? 'StringError'
          : typeof err === 'number'
            ? 'NumberError'
            : 'BooleanError'
      return { message: String(err), type: primitiveType }
    }

    // Handle the case where err might be a plain object or Error instance
    const serialized: Record<string, unknown> = {}

    // Always include these properties if they exist
    if ('message' in err && err.message) serialized.message = err.message
    if ('name' in err && err.name) serialized.name = err.name
    if ('status' in err && err.status !== undefined)
      serialized.status = err.status
    if ('statusCode' in err && err.statusCode !== undefined)
      serialized.statusCode = err.statusCode
    // Determine error type using robust instanceof checks with fallbacks
    if (err instanceof TypeError) {
      serialized.type = 'TypeError'
    } else if (err instanceof ReferenceError) {
      serialized.type = 'ReferenceError'
    } else if (err instanceof SyntaxError) {
      serialized.type = 'SyntaxError'
    } else if (err instanceof RangeError) {
      serialized.type = 'RangeError'
    } else if (err instanceof AggregateError) {
      serialized.type = 'AggregateError'
    } else if (err instanceof Error) {
      serialized.type = 'Error'
    } else if ('name' in err && typeof err.name === 'string' && err.name) {
      serialized.type = err.name
    } else {
      serialized.type = 'UnknownError'
    }

    // Conditionally include stack trace - exclude for 4xx client errors to reduce noise
    const statusCode =
      'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : 'status' in err && typeof err.status === 'number'
          ? err.status
          : undefined
    const shouldIncludeStack = !statusCode || statusCode >= 500
    if ('stack' in err && err.stack && shouldIncludeStack) {
      serialized.stack = err.stack
    }

    // Include cause if provided (often non-enumerable on Error)
    if ('cause' in err && err.cause) {
      // Recursively serialize the cause to maintain structure and avoid losing details
      serialized.cause = createErrorSerializer()(
        err.cause as
          | Error
          | Record<string, unknown>
          | string
          | number
          | boolean,
      )
    }

    // Include any other enumerable properties
    for (const key of Object.keys(err)) {
      if (
        !['message', 'stack', 'name', 'status', 'statusCode', 'type'].includes(
          key,
        )
      ) {
        serialized[key] = (err as Record<string, unknown>)[key]
      }
    }

    return serialized
  }
}

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

const errorSerializer = createErrorSerializer()

const SERIALIZERS = {
  req: createRequestSerializer(),
  error: errorSerializer,
  err: errorSerializer,
} as const

/**
 * Build a Pulsarr log filename from a date (or return the current-log name).
 *
 * If `time` is falsy (null/undefined/0) the function returns `pulsarr-current.log`.
 * Otherwise it returns `pulsarr-YYYY-MM-DD[-index].log.gz` for rotated (compressed) logs.
 *
 * @param time - Date or timestamp to base the filename on; falsy returns the current log name.
 * @param index - Optional rotation index appended as `-index`; only included when a truthy number is provided.
 * @returns The generated log filename.
 */
function filename(time: number | Date | null, index?: number): string {
  if (!time) return 'pulsarr-current.log'
  const date = typeof time === 'number' ? new Date(time) : time
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const indexStr = index ? `-${index}` : ''
  return `pulsarr-${year}-${month}-${day}${indexStr}.log.gz`
}

/**
 * Creates and returns a rotating file stream for logging, ensuring the log directory exists.
 *
 * If the log directory cannot be created or accessed, falls back to standard output.
 *
 * @returns A rotating file stream for logs, or {@link process.stdout} if setup fails.
 */
function getFileStream(): rfs.RotatingFileStream | NodeJS.WriteStream {
  const logDirectory = resolveLogPath()
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
 * Create a child logger that prefixes all messages with an uppercased service name.
 *
 * Returns a Fastify logger child whose message prefix is `[SERVICENAME] ` (serviceName is uppercased).
 *
 * @param serviceName - Service identifier used as the bracketed, uppercased prefix
 * @returns A FastifyBaseLogger child that adds the service message prefix to logged messages
 */
export function createServiceLogger(
  parentLogger: FastifyBaseLogger,
  serviceName: string,
): FastifyBaseLogger {
  return parentLogger.child(
    {},
    { msgPrefix: `[${serviceName.toUpperCase()}] ` },
  )
}

/**
 * Build Pulsarr pino logger options based on environment configuration.
 *
 * Attempts to always enable file-based logging (rotating file stream); if file setup fails
 * the logger falls back to terminal output. When the environment variable `enableConsoleOutput`
 * is not set to the string `'false'` (default: true) the function configures both a pretty
 * terminal stream and a rotating file stream (unless the file stream is `process.stdout`,
 * in which case terminal-only options are returned to avoid double-writing). When console output
 * is disabled, file-only logger options are returned.
 *
 * Environment variables:
 * - enableConsoleOutput — `'false'` disables terminal output; any other value (or unset) enables it.
 *
 * @returns Logger options configured for terminal, file, or combined output.
 */
export function createLoggerConfig(): LoggerOptions & {
  stream?: DestinationStream
} {
  // Read from environment variables with sensible defaults
  const enableConsoleOutput = process.env.enableConsoleOutput !== 'false' // Default true

  // Only log setup message if console output is enabled
  if (enableConsoleOutput) {
    console.log(
      `Setting up logger - Console: ${enableConsoleOutput}, File: always`,
    )
  }

  // Always set up file logging
  const fileStream = getFileStream()

  if (enableConsoleOutput) {
    // Log to both terminal and file

    // Graceful fallback: avoid double-logging if file stream fell back to stdout
    if (fileStream === process.stdout) {
      return {
        level: 'info',
        stream: pretty({ ...PRETTY_OPTIONS, colorize: true }),
        serializers: SERIALIZERS,
      }
    }

    // Create a proper pretty stream for terminal output
    const prettyStream = pretty({
      ...PRETTY_OPTIONS,
      colorize: true, // Force colors even in Docker
    })

    // File stream gets raw ndjson — no pino-pretty transform
    const multistream = pino.multistream([
      { stream: prettyStream, level: 'trace' },
      { stream: fileStream, level: 'trace' },
    ])

    return {
      level: 'info',
      stream: multistream,
      serializers: SERIALIZERS,
    }
  }

  // File logging only — raw ndjson
  return {
    level: 'info',
    stream: fileStream,
    serializers: SERIALIZERS,
  }
}
