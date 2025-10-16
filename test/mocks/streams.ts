import { Readable, Transform, Writable } from 'node:stream'
import { createGzip } from 'node:zlib'

/**
 * Creates a mock Readable stream from an array of strings
 *
 * @param data - Array of strings to emit from the stream
 * @returns A Readable stream that emits the provided data
 *
 * @example
 * const stream = createMockReadable(['line1', 'line2', 'line3'])
 */
export function createMockReadable(data: string[]): Readable {
  return Readable.from(data)
}

/**
 * Creates a mock Readable stream that emits data line by line
 *
 * @param lines - Array of lines to emit
 * @returns A Readable stream with newline-separated data
 *
 * @example
 * const stream = createMockLineStream(['line1', 'line2'])
 * // Emits: 'line1\n', 'line2\n'
 */
export function createMockLineStream(lines: string[]): Readable {
  return Readable.from(lines.map((line) => `${line}\n`))
}

/**
 * Creates a gzipped stream from string data for testing gzip decompression
 *
 * @param data - String data to gzip
 * @returns A Readable stream containing gzipped data
 *
 * @example
 * const gzippedStream = await createGzippedStream('test data')
 */
export async function createGzippedStream(data: string): Promise<Readable> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const gzip = createGzip()

    gzip.on('data', (chunk: Buffer) => chunks.push(chunk))
    gzip.on('end', () => {
      const gzippedData = Buffer.concat(chunks)
      resolve(Readable.from([gzippedData]))
    })
    gzip.on('error', reject)

    gzip.write(data)
    gzip.end()
  })
}

/**
 * Creates a mock Web ReadableStream from a Node.js Readable stream
 *
 * @param nodeStream - Node.js Readable stream
 * @returns Web-compatible ReadableStream
 *
 * @example
 * const nodeStream = createMockReadable(['data'])
 * const webStream = createWebReadableStream(nodeStream)
 */
export function createWebReadableStream(
  nodeStream: Readable,
): ReadableStream<Uint8Array> {
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
}

/**
 * Creates a mock Readable stream that emits chunks with delays
 * Useful for testing streaming behavior and timeouts
 *
 * @param chunks - Array of strings to emit
 * @param delayMs - Delay between chunks in milliseconds
 * @returns A Readable stream that emits chunks with delays
 *
 * @example
 * const stream = createDelayedStream(['chunk1', 'chunk2'], 100)
 */
export function createDelayedStream(
  chunks: string[],
  delayMs: number,
): Readable {
  let index = 0

  return new Readable({
    async read() {
      if (index < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        this.push(chunks[index])
        index++
      } else {
        this.push(null) // Signal end of stream
      }
    },
  })
}

/**
 * Creates a mock Readable stream that errors after emitting some data
 *
 * @param dataBeforeError - Data to emit before error
 * @param error - Error to emit
 * @returns A Readable stream that errors
 *
 * @example
 * const stream = createErrorStream(['chunk1'], new Error('Stream error'))
 */
export function createErrorStream(
  dataBeforeError: string[],
  error: Error,
): Readable {
  let index = 0

  return new Readable({
    read() {
      if (index < dataBeforeError.length) {
        this.push(dataBeforeError[index])
        index++
      } else {
        this.destroy(error)
      }
    },
  })
}

/**
 * Collects all data from a Readable stream into a string
 * Useful for testing stream output
 *
 * @param stream - Readable stream to collect data from
 * @returns Promise that resolves to the collected string
 *
 * @example
 * const data = await collectStreamData(stream)
 */
export async function collectStreamData(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    stream.on('error', reject)
  })
}

/**
 * Collects all data from a Readable stream into an array of lines
 *
 * @param stream - Readable stream to collect lines from
 * @returns Promise that resolves to array of lines
 *
 * @example
 * const lines = await collectStreamLines(stream)
 */
export async function collectStreamLines(stream: Readable): Promise<string[]> {
  const data = await collectStreamData(stream)
  return data.split('\n').filter((line) => line.length > 0)
}

/**
 * Creates a mock Writable stream that collects data into an array
 *
 * @returns Object with the writable stream and a function to get collected data
 *
 * @example
 * const { stream, getData } = createCollectorStream()
 * someReadable.pipe(stream)
 * await finished(stream)
 * const data = getData()
 */
export function createCollectorStream(): {
  stream: Writable
  getData: () => string[]
} {
  const chunks: string[] = []

  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString())
      callback()
    },
  })

  return {
    stream,
    getData: () => chunks,
  }
}

/**
 * Creates a pass-through transform stream for testing pipeline operations
 *
 * @returns A Transform stream that passes data through unchanged
 *
 * @example
 * const transform = createPassThroughTransform()
 * readable.pipe(transform).pipe(writable)
 */
export function createPassThroughTransform(): Transform {
  return new Transform({
    transform(chunk, _encoding, callback) {
      this.push(chunk)
      callback()
    },
  })
}
