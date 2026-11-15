import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { DEFAULT_LOG_LEVEL } from '@root/schemas/config/config.schema.js'
import type { LogLevel } from '@root/types/logs.types.js'
import { resolveEnvPath, resolveLogPath } from '@utils/data-dir.js'
import { LogFileDestination } from '@utils/log-file-destination.js'
import type { FastifyBaseLogger, FastifyRequest } from 'fastify'
import type { DestinationStream, LoggerOptions } from 'pino'
import pino from 'pino'
import pretty from 'pino-pretty'
import * as rfs from 'rotating-file-stream'

export type LogDestination = 'terminal' | 'file' | 'both'

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
const envPath = resolveEnvPath()
if (fs.existsSync(envPath)) {
  const parsed = parseEnv(fs.readFileSync(envPath, 'utf-8'))
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] ??= value
  }
}

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

function filename(args: rfs.GeneratorArguments | null): string {
  if (!args) return 'pulsarr-current.log'
  const { time, index } = args
  const year = time.getFullYear()
  const month = String(time.getMonth() + 1).padStart(2, '0')
  const day = String(time.getDate()).padStart(2, '0')
  const indexStr = index ? `-${index}` : ''
  return `pulsarr-${year}-${month}-${day}${indexStr}.log.gz`
}

function reportOnce(
  stream: rfs.RotatingFileStream,
  event: 'error' | 'warning',
  label: string,
): void {
  let reported = false
  stream.on(event, (err: Error) => {
    if (reported) return
    reported = true
    console.error(label, err)
  })
}

function openLogFile(): rfs.RotatingFileStream {
  const logDirectory = resolveLogPath()
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true })
  }
  const stream = rfs.createStream(filename, {
    size: '10M',
    path: logDirectory,
    compress: 'gzip',
    maxFiles: 7,
  })
  reportOnce(stream, 'error', 'Log file stream failed:')
  reportOnce(stream, 'warning', 'Log file stream warning:')
  return stream
}

let activeLogFile: LogFileDestination | null = null

function createLogFile(
  enableConsoleOutput: boolean,
): LogFileDestination | null {
  let initial: rfs.RotatingFileStream
  try {
    initial = openLogFile()
  } catch (err) {
    console.error('Failed to setup log directory:', err)
    return null
  }
  activeLogFile = new LogFileDestination({
    initial,
    open: openLogFile,
    fallback: enableConsoleOutput
      ? () => {}
      : (line) => {
          process.stdout.write(line)
        },
  })
  return activeLogFile
}

/** Flushes and closes the log file, resolving at once when none is open, and never rejects. */
export function endLogFile(): Promise<void> {
  return activeLogFile?.end() ?? Promise.resolve()
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

  const fileStream = createLogFile(enableConsoleOutput)

  if (!fileStream) {
    return {
      level: DEFAULT_LOG_LEVEL,
      stream: enableConsoleOutput
        ? pretty({ ...PRETTY_OPTIONS, colorize: true })
        : process.stdout,
      serializers: SERIALIZERS,
    }
  }

  if (enableConsoleOutput) {
    // Log to both terminal and file

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
      level: DEFAULT_LOG_LEVEL,
      stream: multistream,
      serializers: SERIALIZERS,
    }
  }

  // File logging only — raw ndjson
  return {
    level: DEFAULT_LOG_LEVEL,
    stream: fileStream,
    serializers: SERIALIZERS,
  }
}
