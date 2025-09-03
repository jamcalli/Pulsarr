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
  } = options

  let response: Response | undefined

  // Retry logic for transient failures
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(timeout),
      })

      if (response.ok) {
        break
      } else if (response.status >= 500 && attempt < retries) {
        // Retry on server errors
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        )
      } else {
        throw new Error(
          `Failed to fetch from ${url}: ${response.status} ${response.statusText}`,
        )
      }
    } catch (error) {
      if (attempt === retries) {
        throw error
      }
      // Exponential backoff for retries
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }

  if (!response || !response.ok) {
    throw new Error(`Failed to fetch from ${url} after ${retries + 1} attempts`)
  }

  if (!response.body) {
    throw new Error('Fetch returned no body')
  }

  const nodeBody = Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
  let stream = nodeBody

  // Only decompress if server didn't already decompress it
  if (isGzipped && response.headers.get('content-encoding') !== 'gzip') {
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
  } = options

  let response: Response | undefined

  // Retry logic for transient failures
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent },
        signal: AbortSignal.timeout(timeout),
      })

      if (response.ok) {
        break
      } else if (response.status >= 500 && attempt < retries) {
        // Retry on server errors
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        )
      } else {
        throw new Error(
          `Failed to fetch from ${url}: ${response.status} ${response.statusText}`,
        )
      }
    } catch (error) {
      if (attempt === retries) {
        throw error
      }
      // Exponential backoff for retries
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }

  if (!response || !response.ok) {
    throw new Error(`Failed to fetch from ${url} after ${retries + 1} attempts`)
  }

  if (isGzipped && response.headers.get('content-encoding') !== 'gzip') {
    // Server didn't decompress, we need to do it manually
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
