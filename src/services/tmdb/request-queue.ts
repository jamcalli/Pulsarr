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

function withJitter(baseWaitTime: number): number {
  const jitter = baseWaitTime * JITTER_RATIO
  return baseWaitTime + (Math.random() * 2 - 1) * jitter
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
        this.timestamps.push(Date.now())
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
    try {
      const response = await this.send(url, init)

      if (response.status === 429) {
        if (retryCount429 >= this.maxRetries) {
          throw new Error('TMDB rate limit exceeded, max retries reached')
        }

        // TMDB sends retry-after on a 429, so honor it instead of the backoff
        const retryAfter = response.headers.get('retry-after')
        const waitTime = withJitter(
          retryAfter
            ? Number.parseInt(retryAfter, 10) * 1000
            : 2 ** (retryCount429 + 1) * 1000,
        )

        this.log.warn(
          `TMDB rate limit hit (429), retrying after ${Math.round(waitTime)}ms (attempt ${retryCount429 + 1}/${this.maxRetries})`,
        )

        await delay(waitTime)
        return this.execute(url, init, retryCount429 + 1, retryCountNetwork)
      }

      return response
    } catch (error) {
      if (retryCountNetwork < this.maxRetries) {
        const waitTime = withJitter(2 ** retryCountNetwork * 1000)

        this.log.warn(
          `TMDB request failed, retrying after ${Math.round(waitTime)}ms (attempt ${retryCountNetwork + 1}/${this.maxRetries})`,
        )
        await delay(waitTime)
        return this.execute(url, init, retryCount429, retryCountNetwork + 1)
      }
      throw error
    }
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }
}
