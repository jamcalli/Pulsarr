import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import type { FastifyRequest } from 'fastify'
import type { LevelWithSilent, LoggerOptions } from 'pino'
import pino from 'pino'
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

interface FileLoggerOptions extends LoggerOptions {
  stream: rfs.RotatingFileStream | NodeJS.WriteStream
}

interface MultiStreamLoggerOptions extends LoggerOptions {
  stream: pino.MultiStreamRes
}

type PulsarrLoggerOptions =
  | LoggerOptions
  | FileLoggerOptions
  | MultiStreamLoggerOptions

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..', '..')

// Load .env file early for logger configuration
config({ path: resolve(projectRoot, '.env') })

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
 * Returns logger options configured for terminal output with human-readable formatting and redacted sensitive request data.
 *
 * Uses the 'info' log level, formats logs with `pino-pretty` (including colorized output), and applies a serializer that redacts sensitive query parameters from Fastify request logs.
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
      error: createErrorSerializer(),
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
      error: createErrorSerializer(),
    },
  }
}

/**
 * Generates logger configuration options based on environment variables.
 *
 * Always logs to file. Console output and request logging controlled by environment variables.
 * Environment variables:
 * - enableConsoleOutput: Show logs in terminal (default: true)
 * - enableRequestLogging: Fastify HTTP request logging (default: true)
 *
 * @returns Logger configuration options suitable for initializing a logger.
 */
export function createLoggerConfig(): PulsarrLoggerOptions {
  // Read from environment variables with sensible defaults
  const enableConsoleOutput = process.env.enableConsoleOutput !== 'false' // Default true
  const enableRequestLogging = process.env.enableRequestLogging !== 'false' // Default true

  // Only log setup message if console output is enabled
  if (enableConsoleOutput) {
    console.log(
      `Setting up logger - Console: ${enableConsoleOutput}, Request: ${enableRequestLogging}, File: always`,
    )
  }

  // Always set up file logging
  const fileStream = getFileStream()

  if (enableConsoleOutput) {
    // Log to both terminal and file

    // Graceful fallback: avoid double-logging if file stream fell back to stdout
    if (fileStream === process.stdout) {
      return getTerminalOptions()
    }

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
        error: createErrorSerializer(),
      },
    }
  } else {
    // File logging only
    return getFileOptions()
  }
}
