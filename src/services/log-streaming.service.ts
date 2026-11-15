import { EventEmitter } from 'node:events'
import { type FileHandle, open, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { LogEntry, LogValue } from '@root/types/logs.types.js'
import { resolveLogPath } from '@utils/data-dir.js'
import {
  createServiceLogger,
  parseModuleFromMsg,
  pinoLevelToName,
} from '@utils/logger.js'
import type { FastifyBaseLogger } from 'fastify'

export interface LogStreamingOptions {
  tail: number
  follow: boolean
  filter?: string
}

const PINO_STANDARD_FIELDS = new Set([
  'level',
  'time',
  'msg',
  'pid',
  'hostname',
  'v',
])

const MAX_STREAM_LISTENERS = 100
const WATCH_INTERVAL_MS = 1000
const TAIL_READ_CHUNK_BYTES = 64 * 1024
const TAIL_READ_MAX_BYTES = 4 * 1024 * 1024
const LIVE_READ_CHUNK_BYTES = 64 * 1024
const NEWLINE = 0x0a

interface WatchedFile {
  phase: 'watching'
  position: number
  interval: NodeJS.Timeout
  tickInFlight: boolean
  partialLine: string
  decoder: StringDecoder
}

type WatchState = { phase: 'idle' } | { phase: 'starting' } | WatchedFile

const IDLE: WatchState = { phase: 'idle' }

/** Returns undefined when there is no filter, so callers can skip filtering entirely. */
export function createLogFilter(
  filter?: string,
): ((entry: LogEntry) => boolean) | undefined {
  if (!filter) return undefined
  const needle = filter.toLowerCase()
  return (entry) => entry.message.toLowerCase().includes(needle)
}

function countNewlines(buffer: Buffer): number {
  let count = 0
  let index = buffer.indexOf(NEWLINE)
  while (index !== -1) {
    count++
    index = buffer.indexOf(NEWLINE, index + 1)
  }
  return count
}

function nonBlankLines(text: string, startsMidLine: boolean): string[] {
  const lines = text.split('\n')
  return (startsMidLine ? lines.slice(1) : lines).filter((line) => line.trim())
}

export class LogStreamingService {
  private readonly eventEmitter = new EventEmitter()
  private readonly activeConnections = new Map<string, LogStreamingOptions>()
  private readonly logFilePath: string
  private readonly log: FastifyBaseLogger
  private watch: WatchState = IDLE

  constructor(baseLog: FastifyBaseLogger) {
    this.log = createServiceLogger(baseLog, 'LOG_STREAMING')
    this.eventEmitter.setMaxListeners(MAX_STREAM_LISTENERS)
    this.logFilePath = resolve(resolveLogPath(), 'pulsarr-current.log')
  }

  addConnection(id: string, options: LogStreamingOptions) {
    this.activeConnections.set(id, options)
    this.log.debug(
      { connectionId: id, options },
      'Adding log streaming connection',
    )
    void this.startFileWatching()
  }

  removeConnection(id: string) {
    if (!this.activeConnections.has(id)) {
      return
    }
    this.activeConnections.delete(id)
    this.log.debug({ connectionId: id }, 'Removing log streaming connection')
    if (this.activeConnections.size === 0) {
      this.stopFileWatching()
    }
  }

  getEventEmitter() {
    return this.eventEmitter
  }

  shutdown(): void {
    this.stopFileWatching()
    this.watch = IDLE
    this.activeConnections.clear()
    this.eventEmitter.removeAllListeners()
  }

  async getTailLines(lines: number, filter?: string): Promise<LogEntry[]> {
    if (lines <= 0) return []
    let found: string[]
    try {
      const fileHandle = await open(this.logFilePath, 'r')
      try {
        found = await this.readTail(fileHandle, lines)
      } finally {
        await fileHandle.close()
      }
    } catch (error) {
      this.log.warn({ error }, 'Failed to read log file for tail')
      return []
    }

    const entries = found.slice(-lines).map((line) => this.parseLogLine(line))
    const matches = createLogFilter(filter)
    return matches ? entries.filter(matches) : entries
  }

  private async readTail(
    fileHandle: FileHandle,
    lines: number,
  ): Promise<string[]> {
    const { size } = await fileHandle.stat()
    const floor = Math.max(0, size - TAIL_READ_MAX_BYTES)
    const chunks: Buffer[] = []
    let start = size
    let newlines = 0

    while (start > floor) {
      const length = Math.min(TAIL_READ_CHUNK_BYTES, start - floor)
      start -= length
      const chunk = Buffer.allocUnsafe(length)
      const { bytesRead } = await fileHandle.read(chunk, 0, length, start)
      const read = chunk.subarray(0, bytesRead)
      chunks.unshift(read)
      newlines += countNewlines(read)

      // Blank lines are dropped, so enough newlines is necessary but not sufficient
      if (newlines >= lines && start > floor) {
        const found = nonBlankLines(
          Buffer.concat(chunks).toString('utf8'),
          true,
        )
        if (found.length >= lines) return found
      }
    }

    return nonBlankLines(Buffer.concat(chunks).toString('utf8'), start > 0)
  }

  private parseLogLine(line: string): LogEntry {
    try {
      const parsed: Record<string, LogValue> = JSON.parse(line)
      const timestamp =
        typeof parsed.time === 'number' || typeof parsed.time === 'string'
          ? new Date(parsed.time).toISOString()
          : new Date().toISOString()
      const level = pinoLevelToName(
        typeof parsed.level === 'number' ? parsed.level : 0,
      )
      const { module, message } = parseModuleFromMsg(
        typeof parsed.msg === 'string' ? parsed.msg : '',
      )

      let data: Record<string, LogValue> | undefined
      for (const key of Object.keys(parsed)) {
        if (PINO_STANDARD_FIELDS.has(key)) continue
        if (key === 'err' && !parsed[key]) continue
        if (!data) data = {}
        data[key] = parsed[key]
      }

      return { timestamp, level, message, module, data }
    } catch {
      // Non-JSON line (legacy pretty text, console.log output, stack traces)
      return {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: line,
        module: undefined,
      }
    }
  }

  private async startFileWatching() {
    if (this.watch.phase !== 'idle') {
      return
    }
    const starting: WatchState = { phase: 'starting' }
    this.watch = starting

    let position = 0
    try {
      position = (await stat(this.logFilePath)).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.debug(
          { file: this.logFilePath },
          'Log file not found at startup, will watch for creation',
        )
      } else {
        this.log.warn(
          { error, file: this.logFilePath },
          'Failed to start watching log file',
        )
        if (this.watch === starting) this.watch = IDLE
        return
      }
    }

    // A shutdown or a newer start may have replaced this one while stat ran
    if (this.watch !== starting) {
      return
    }
    if (this.activeConnections.size === 0) {
      this.watch = IDLE
      return
    }

    const watched: WatchedFile = {
      phase: 'watching',
      position,
      interval: setInterval(() => void this.tick(watched), WATCH_INTERVAL_MS),
      tickInFlight: false,
      partialLine: '',
      decoder: new StringDecoder('utf8'),
    }
    this.watch = watched
    this.log.debug({ file: this.logFilePath }, 'Started watching log file')
  }

  private stopFileWatching() {
    // A start still awaiting stat sees no connections and goes idle itself
    if (this.watch.phase !== 'watching') {
      return
    }
    clearInterval(this.watch.interval)
    this.watch = IDLE
    this.log.debug({ file: this.logFilePath }, 'Stopped watching log file')
  }

  private async tick(watched: WatchedFile) {
    if (watched.tickInFlight) return
    watched.tickInFlight = true
    try {
      await this.checkFileChanges(watched)
    } finally {
      watched.tickInFlight = false
    }
  }

  private async checkFileChanges(watched: WatchedFile) {
    try {
      const fileHandle = await open(this.logFilePath, 'r')
      try {
        const { size } = await fileHandle.stat()

        if (size < watched.position) {
          // Rotated or truncated, so read the new file from its start
          watched.position = 0
          watched.partialLine = ''
          watched.decoder = new StringDecoder('utf8')
        }
        if (size === watched.position) {
          return
        }

        const chunk = Buffer.allocUnsafe(LIVE_READ_CHUNK_BYTES)
        while (watched.position < size && this.watch === watched) {
          const length = Math.min(chunk.length, size - watched.position)
          const { bytesRead } = await fileHandle.read(
            chunk,
            0,
            length,
            watched.position,
          )
          if (bytesRead === 0 || this.watch !== watched) break
          watched.position += bytesRead
          this.emitLines(
            watched,
            watched.decoder.write(chunk.subarray(0, bytesRead)),
          )
        }
      } finally {
        await fileHandle.close()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.debug(
          { file: this.logFilePath },
          'Log file not found when checking changes',
        )
        return
      }
      this.log.warn(
        { error, file: this.logFilePath },
        'Error checking file changes',
      )
    }
  }

  private emitLines(watched: WatchedFile, text: string) {
    const content = watched.partialLine + text
    const lastNewline = content.lastIndexOf('\n')
    if (lastNewline === -1) {
      watched.partialLine = content
      return
    }
    watched.partialLine = content.slice(lastNewline + 1)
    for (const line of content.slice(0, lastNewline).split('\n')) {
      if (line.trim()) {
        this.eventEmitter.emit('log', this.parseLogLine(line))
      }
    }
  }
}
