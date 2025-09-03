/**
 * Streaming Utilities
 *
 * Simple utilities for streaming data from URLs.
 * Services handle their own database operations.
 */

import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
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

      const backoff = retryAfter
        ? Number(retryAfter) * 1000
        : baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 250)

      await new Promise((r) => setTimeout(r, backoff))
    } catch (err) {
      lastErr = err
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
    const line = String(rawLine).trim()
    if (line) {
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
    // Resource-level gzip: gunzip the body content
    const buffer = await response.arrayBuffer()
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      const gunzip = createGunzip()
      const chunks: Buffer[] = []
      gunzip.on('data', (chunk) => chunks.push(chunk))
      gunzip.on('end', () => resolve(Buffer.concat(chunks)))
      gunzip.on('error', reject)
      gunzip.end(Buffer.from(buffer))
    })
    return decompressed.toString('utf-8')
  } else {
    return response.text()
  }
}
