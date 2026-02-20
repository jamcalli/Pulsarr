import { EventEmitter } from 'node:events'
import { open, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { LogEntry, LogLevel } from '@schemas/logs/logs.schema.js'
import { resolveLogPath } from '@utils/data-dir.js'
import {
  createServiceLogger,
  parseModuleFromMsg,
  pinoLevelToName,
} from '@utils/logger.js'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'

export interface LogStreamingOptions {
  tail: number
  follow: boolean
  filter?: string
}

// Standard pino fields to exclude when collecting extra data
const PINO_STANDARD_FIELDS = new Set([
  'level',
  'time',
  'msg',
  'pid',
  'hostname',
  'err',
])

export class LogStreamingService {
  private static instance: LogStreamingService
  private eventEmitter: EventEmitter
  private activeConnections: Map<string, LogStreamingOptions> = new Map()
  private watchedFiles: Map<
    string,
    { size: number; interval?: NodeJS.Timeout }
  > = new Map()
  private readonly logFilePath: string
  private _watchTickInFlight = false
  private partialLine = ''
  private readonly log: FastifyBaseLogger

  private constructor(
    readonly baseLog: FastifyBaseLogger,
    readonly _fastify: FastifyInstance,
  ) {
    this.log = createServiceLogger(baseLog, 'LOG_STREAMING')
    this.eventEmitter = new EventEmitter()
    // Allow many concurrent SSE consumers without warnings
    this.eventEmitter.setMaxListeners(100)
    this.logFilePath = resolve(resolveLogPath(), 'pulsarr-current.log')
  }

  static getInstance(
    baseLog: FastifyBaseLogger,
    fastify: FastifyInstance,
  ): LogStreamingService {
    if (!LogStreamingService.instance) {
      LogStreamingService.instance = new LogStreamingService(baseLog, fastify)
    }
    return LogStreamingService.instance
  }

  addConnection(id: string, options: LogStreamingOptions) {
    this.activeConnections.set(id, options)
    this.log.debug(
      { connectionId: id, options },
      'Adding log streaming connection',
    )

    // Start watching if this is the first connection
    if (this.activeConnections.size === 1) {
      this.startFileWatching()
    }
  }

  removeConnection(id: string) {
    this.activeConnections.delete(id)
    this.log.debug({ connectionId: id }, 'Removing log streaming connection')

    // Stop watching if no connections remain
    if (this.activeConnections.size === 0) {
      this.stopFileWatching()
    }
  }

  getEventEmitter() {
    return this.eventEmitter
  }

  hasActiveConnections(): boolean {
    return this.activeConnections.size > 0
  }

  shutdown(): void {
    for (const [_file, { interval }] of this.watchedFiles) {
      if (interval) {
        clearInterval(interval)
      }
    }
    this.watchedFiles.clear()
    this.activeConnections.clear()
    this.eventEmitter.removeAllListeners()
    this.partialLine = ''
  }

  async getTailLines(lines: number, filter?: string): Promise<LogEntry[]> {
    if (lines <= 0) return []
    try {
      const fileHandle = await open(this.logFilePath, 'r')
      const stats = await fileHandle.stat()

      try {
        // Start with a reasonable chunk size (64KB) and grow if needed
        const maxChunkSize = 256 * 1024 // 256KB max
        let chunkSize = Math.min(64 * 1024, stats.size)
        let foundLines: string[] = []

        // Always read at least once, then continue if needed
        do {
          const start = Math.max(0, stats.size - chunkSize)
          const buffer = Buffer.alloc(chunkSize)
          const { bytesRead } = await fileHandle.read(
            buffer,
            0,
            chunkSize,
            start,
          )

          const content = buffer.subarray(0, bytesRead).toString('utf-8')
          const allLines = content
            .trim()
            .split('\n')
            .filter((line) => line.trim())

          foundLines = allLines

          // If we have enough lines or read the whole file, break
          if (
            foundLines.length >= lines ||
            chunkSize >= stats.size ||
            chunkSize >= maxChunkSize
          ) {
            break
          }

          // Double chunk size for next attempt, up to max
          const next = Math.min(chunkSize * 2, stats.size, maxChunkSize)
          if (next === chunkSize) break
          chunkSize = next
        } while (foundLines.length < lines && chunkSize < maxChunkSize)

        // Get the last N lines
        let tailLines = foundLines.slice(-lines)

        // Apply filter if provided
        if (filter) {
          tailLines = tailLines.filter((line) =>
            line.toLowerCase().includes(filter.toLowerCase()),
          )
        }

        return tailLines.map((line) => this.parseLogLine(line))
      } finally {
        await fileHandle.close()
      }
    } catch (error) {
      this.log.warn({ error }, 'Failed to read log file for tail')
      return []
    }
  }

  private parseLogLine(line: string): LogEntry {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      const timestamp = parsed.time
        ? new Date(parsed.time as number).toISOString()
        : new Date().toISOString()
      const level = pinoLevelToName(parsed.level as number)
      const { module, message } = parseModuleFromMsg(
        (parsed.msg as string) ?? '',
      )

      // Collect extra fields beyond standard pino fields into data
      let data: Record<string, unknown> | undefined
      for (const key of Object.keys(parsed)) {
        if (!PINO_STANDARD_FIELDS.has(key)) {
          if (!data) data = {}
          data[key] = parsed[key]
        }
      }

      // Include err object in data if present
      if (parsed.err) {
        if (!data) data = {}
        data.err = parsed.err
      }

      return { timestamp, level, message, module, data }
    } catch {
      // Non-JSON line (legacy pretty text, console.log output, stack traces)
      return {
        timestamp: new Date().toISOString(),
        level: 'info' as LogLevel,
        message: line,
        module: undefined,
      }
    }
  }

  private async startFileWatching() {
    if (this.watchedFiles.has(this.logFilePath)) {
      return
    }

    // Initialize entry and start interval regardless of file existence
    let initialSize = 0
    try {
      const stats = await stat(this.logFilePath)
      initialSize = stats.size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.debug(
          {
            file: this.logFilePath,
          },
          'Log file not found at startup, will watch for creation',
        )
      } else {
        // Unexpected error, abort
        this.log.warn(
          {
            error,
            file: this.logFilePath,
          },
          'Failed to start watching log file',
        )
        return
      }
    }

    this.watchedFiles.set(this.logFilePath, { size: initialSize })

    // Always start the polling interval
    const interval = setInterval(async () => {
      if (this._watchTickInFlight) return
      this._watchTickInFlight = true
      try {
        await this.checkFileChanges()
      } finally {
        this._watchTickInFlight = false
      }
    }, 1000)

    const fileInfo = this.watchedFiles.get(this.logFilePath)
    if (fileInfo) {
      fileInfo.interval = interval
    }

    this.log.debug({ file: this.logFilePath }, 'Started watching log file')
  }

  private stopFileWatching() {
    const fileInfo = this.watchedFiles.get(this.logFilePath)
    if (fileInfo?.interval) {
      clearInterval(fileInfo.interval)
      this.watchedFiles.delete(this.logFilePath)
      this.log.debug({ file: this.logFilePath }, 'Stopped watching log file')
    }
  }

  private async checkFileChanges() {
    try {
      const stats = await stat(this.logFilePath)
      const fileInfo = this.watchedFiles.get(this.logFilePath)

      if (!fileInfo) {
        return
      }

      if (stats.size > fileInfo.size) {
        // File has grown, read the new content properly
        const fileHandle = await open(this.logFilePath, 'r')
        try {
          const buffer = Buffer.alloc(stats.size - fileInfo.size)
          const { bytesRead } = await fileHandle.read(
            buffer,
            0,
            buffer.length,
            fileInfo.size,
          )
          const newContent = buffer.subarray(0, bytesRead).toString('utf-8')

          // Handle partial lines from previous reads
          const fullContent = this.partialLine + newContent
          const lines = fullContent.split('\n')

          // Keep the last line as partial if it doesn't end with newline
          const endsWithNewline = newContent.endsWith('\n')
          const newLines = endsWithNewline
            ? lines.filter((line) => line.trim())
            : lines.slice(0, -1).filter((line) => line.trim())

          // Store any partial line for next read
          this.partialLine = endsWithNewline ? '' : lines[lines.length - 1]

          if (newLines.length > 0) {
            for (const line of newLines) {
              const entry: LogEntry = this.parseLogLine(line)
              this.eventEmitter.emit('log', entry)
            }
          }
        } finally {
          await fileHandle.close()
        }

        fileInfo.size = stats.size
      } else if (stats.size < fileInfo.size) {
        // File was truncated or rotated, reset size and clear partial line
        fileInfo.size = stats.size
        this.partialLine = ''
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        this.log.debug(
          {
            file: this.logFilePath,
          },
          'Log file not found when checking changes',
        )
        return
      }
      this.log.warn(
        {
          error,
          file: this.logFilePath,
        },
        'Error checking file changes',
      )
    }
  }
}
