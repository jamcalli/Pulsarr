import type { FastifyBaseLogger } from 'fastify'

export interface TmdbRequestQueueOptions {
  requestsPerSecond?: number
  windowMs?: number
  timeoutMs?: number
  maxRetries?: number
  fetchImpl?: typeof fetch
}

interface QueuedRequest {
  url: string
  init: RequestInit
  resolve: (value: Response) => void
  reject: (reason: Error) => void
}

const JITTER_RATIO = 0.1

export class TmdbTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`TMDB request timed out after ${timeoutMs}ms`)
    this.name = 'TmdbTimeoutError'
  }
}

function withJitter(baseWaitTime: number): number {
  const jitter = baseWaitTime * JITTER_RATIO
  return baseWaitTime + (Math.random() * 2 - 1) * jitter
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// retry-after is either delay-seconds or an HTTP date
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000
  const at = Date.parse(header)
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now())
}

export class TmdbRequestQueue {
  private readonly requestsPerSecond: number
  private readonly windowMs: number
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly fetchImpl: typeof fetch

  private readonly queue: QueuedRequest[] = []
  private timestamps: number[] = []
  private isProcessing = false

  constructor(
    private readonly log: FastifyBaseLogger,
    options: TmdbRequestQueueOptions = {},
  ) {
    this.requestsPerSecond = options.requestsPerSecond ?? 40
    this.windowMs = options.windowMs ?? 1000
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.maxRetries = options.maxRetries ?? 3
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  fetch(url: string, init: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, init, resolve, reject })

      if (!this.isProcessing) {
        void this.process()
      }
    })
  }

  private async process(): Promise<void> {
    this.isProcessing = true

    while (this.queue.length > 0) {
      const now = Date.now()

      this.timestamps = this.timestamps.filter(
        (timestamp) => now - timestamp < this.windowMs,
      )

      if (this.timestamps.length >= this.requestsPerSecond) {
        const waitTime = this.windowMs - (now - this.timestamps[0])
        this.log.debug(`Rate limit reached, waiting ${waitTime}ms`)
        await delay(waitTime)
        continue
      }

      const request = this.queue.shift()
      if (!request) continue

      try {
        const response = await this.execute(request.url, request.init)
        request.resolve(response)
      } catch (error) {
        request.reject(error as Error)
      }
    }

    this.isProcessing = false
  }

  private async execute(
    url: string,
    init: RequestInit,
    retryCount429 = 0,
    retryCountNetwork = 0,
  ): Promise<Response> {
    let response: Response
    try {
      response = await this.send(url, init)
    } catch (error) {
      if (
        error instanceof TmdbTimeoutError ||
        retryCountNetwork >= this.maxRetries
      ) {
        throw error
      }
      const waitTime = withJitter(2 ** retryCountNetwork * 1000)
      this.log.warn(
        `TMDB request failed, retrying after ${Math.round(waitTime)}ms (attempt ${retryCountNetwork + 1}/${this.maxRetries})`,
      )
      await delay(waitTime)
      return this.execute(url, init, retryCount429, retryCountNetwork + 1)
    }

    if (response.status !== 429) {
      return response
    }
    if (retryCount429 >= this.maxRetries) {
      throw new Error('TMDB rate limit exceeded, max retries reached')
    }

    const waitTime = withJitter(
      parseRetryAfter(response.headers.get('retry-after')) ??
        2 ** (retryCount429 + 1) * 1000,
    )
    this.log.warn(
      `TMDB rate limit hit (429), retrying after ${Math.round(waitTime)}ms (attempt ${retryCount429 + 1}/${this.maxRetries})`,
    )
    await delay(waitTime)
    return this.execute(url, init, retryCount429 + 1, retryCountNetwork)
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    this.timestamps.push(Date.now())

    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new TmdbTimeoutError(this.timeoutMs)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}
