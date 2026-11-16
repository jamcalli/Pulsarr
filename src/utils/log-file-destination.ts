import type { Writable } from 'node:stream'
import type { DestinationStream } from 'pino'

export const LOG_FILE_REOPEN_DELAY_MS = 30_000

export interface LogFileDestinationOptions {
  initial: Writable
  open: () => Writable
  fallback: (line: string) => void
  reopenDelayMs?: number
}

/** Writes to the current log file, reopens it after a failure, and sends lines to `fallback` while no file is open. */
export class LogFileDestination implements DestinationStream {
  private stream: Writable | null = null
  private reopenTimer: NodeJS.Timeout | null = null
  private ending: Promise<void> | null = null
  private readonly open: () => Writable
  private readonly fallback: (line: string) => void
  private readonly reopenDelayMs: number

  constructor(options: LogFileDestinationOptions) {
    this.open = options.open
    this.fallback = options.fallback
    this.reopenDelayMs = options.reopenDelayMs ?? LOG_FILE_REOPEN_DELAY_MS
    this.attach(options.initial)
  }

  write(line: string): void {
    const stream = this.stream
    if (stream && !stream.destroyed && !stream.writableEnded) {
      stream.write(line, (error) => {
        if (error) this.fallback(line)
      })
    } else {
      this.fallback(line)
    }
  }

  /** Resolves once the open file has flushed and closed, and never rejects. */
  end(): Promise<void> {
    this.ending ??= this.finish()
    return this.ending
  }

  private finish(): Promise<void> {
    if (this.reopenTimer) {
      clearTimeout(this.reopenTimer)
      this.reopenTimer = null
    }
    const stream = this.stream
    this.stream = null
    if (!stream || stream.destroyed || stream.writableFinished) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const done = () => resolve()
      stream.once('finish', done)
      stream.once('close', done)
      stream.once('error', done)
      stream.end()
    })
  }

  private attach(stream: Writable): void {
    this.stream = stream
    const lost = () => {
      if (this.stream !== stream) return
      this.stream = null
      this.scheduleReopen()
    }
    stream.on('error', lost)
    stream.on('close', lost)
  }

  private scheduleReopen(): void {
    if (this.ending || this.reopenTimer) return
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null
      if (this.ending) return
      try {
        this.attach(this.open())
      } catch {
        this.scheduleReopen()
      }
    }, this.reopenDelayMs)
    this.reopenTimer.unref()
  }
}
