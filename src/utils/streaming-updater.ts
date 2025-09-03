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
  } = options

  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(timeout),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch from ${url}: ${response.status} ${response.statusText}`,
    )
  }

  if (!response.body) {
    throw new Error('Fetch returned no body')
  }

  const nodeBody = Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
  let stream = nodeBody

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
  } = options

  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(timeout),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch from ${url}: ${response.status} ${response.statusText}`,
    )
  }

  if (isGzipped) {
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
