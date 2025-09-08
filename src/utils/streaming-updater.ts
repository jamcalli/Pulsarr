/**
 * Streaming Utilities
 *
 * Simple utilities for streaming data from URLs.
 * Services handle their own database operations.
 */

import { createInterface } from 'node:readline'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

const DEFAULT_TIMEOUT = 300_000 // 5 minutes
const DEFAULT_USER_AGENT = 'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)'

type FetchInit = Parameters<typeof fetch>[1]

async function fetchWithRetries(
  url: string,
  init: FetchInit,
  retries: number,
  baseDelayMs = 1000,
): Promise<globalThis.Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (res.ok) return res

      const retryAfter = res.headers.get('retry-after')
      const status = res.status
      const shouldRetry = status >= 500 || status === 408 || status === 429

      if (!shouldRetry || attempt === retries) {
        throw new Error(`Failed to fetch ${url}: ${status} ${res.statusText}`)
      }

      let backoff: number | null = null
      if (retryAfter) {
        const secs = Number(retryAfter)
        if (Number.isFinite(secs) && secs >= 0) {
          backoff = secs * 1000
        } else {
          const dateMs = Date.parse(retryAfter)
          if (!Number.isNaN(dateMs)) backoff = Math.max(0, dateMs - Date.now())
        }
      }
      const backoffMs =
        backoff ?? baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250)

      await new Promise((r) => setTimeout(r, backoffMs))
    } catch (err) {
      lastErr = err
      // Respect cancellation promptly
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      if (attempt === retries) throw err

      const backoff =
        baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr as Error
}

export interface StreamOptions {
  /** URL to fetch data from */
  url: string
  /** Timeout for fetch request in milliseconds */
  timeout?: number
  /** Custom User-Agent header */
  userAgent?: string
  /** Whether the response is gzipped */
  isGzipped?: boolean
  /** Number of retry attempts for transient failures */
  retries?: number
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Stream lines from a URL (good for TSV/CSV files)
 */
export async function* streamLines(
  options: StreamOptions,
): AsyncGenerator<string> {
  const {
    url,
    timeout = DEFAULT_TIMEOUT,
    userAgent = DEFAULT_USER_AGENT,
    isGzipped = false,
    retries = 2,
    signal,
  } = options

  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout)

  const response = await fetchWithRetries(
    url,
    {
      headers: { 'User-Agent': userAgent },
      signal: effectiveSignal,
    },
    retries,
  )

  if (!response.body) {
    throw new Error('Fetch returned no body')
  }

  const nodeBody = Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
  let stream = nodeBody

  // Resource-level gzip (.gz file): always gunzip regardless of transport encoding
  if (isGzipped) {
    stream = nodeBody.pipe(createGunzip())
  }

  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const rawLine of rl) {
    const line = String(rawLine)
    if (line.length > 0) {
      yield line
    }
  }
}

/**
 * Fetch entire content from a URL (good for XML/JSON files)
 */
export async function fetchContent(options: StreamOptions): Promise<string> {
  const {
    url,
    timeout = DEFAULT_TIMEOUT,
    userAgent = DEFAULT_USER_AGENT,
    isGzipped = false,
    retries = 2,
    signal,
  } = options

  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout)

  const response = await fetchWithRetries(
    url,
    {
      headers: { 'User-Agent': userAgent },
      signal: effectiveSignal,
    },
    retries,
  )

  if (isGzipped) {
    if (!response.body) {
      throw new Error('Fetch returned no body')
    }
    const chunks: Buffer[] = []
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createGunzip(),
      new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.from(chunk))
          cb()
        },
      }),
    )
    return Buffer.concat(chunks).toString('utf-8')
  }
  return response.text()
}
