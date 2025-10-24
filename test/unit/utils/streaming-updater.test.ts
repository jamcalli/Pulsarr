import { Readable } from 'node:stream'
import { createGzip } from 'node:zlib'
import { fetchContent, streamLines } from '@utils/streaming-updater.js'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../setup/msw-setup.js'

describe('streaming-updater', () => {
  beforeEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('streamLines', () => {
    it('should stream lines from plain text response', async () => {
      server.use(
        http.get('https://example.com/data.txt', () => {
          return new HttpResponse('line1\nline2\nline3\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/data.txt',
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })

    it('should skip empty lines', async () => {
      server.use(
        http.get('https://example.com/data.txt', () => {
          return new HttpResponse('line1\n\nline2\n\n\nline3\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/data.txt',
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })

    it('should handle CRLF line endings', async () => {
      server.use(
        http.get('https://example.com/data.txt', () => {
          return new HttpResponse('line1\r\nline2\r\nline3\r\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/data.txt',
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })

    it('should decompress gzipped content when isGzipped is true', async () => {
      server.use(
        http.get('https://example.com/data.gz', () => {
          const gzip = createGzip()
          const readable = Readable.from(['line1\n', 'line2\n', 'line3\n'])
          const stream = readable.pipe(gzip)

          return new HttpResponse(stream as unknown as ReadableStream, {
            headers: { 'Content-Type': 'application/gzip' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/data.gz',
        isGzipped: true,
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['line1', 'line2', 'line3'])
    })

    it('should use custom User-Agent header', async () => {
      let capturedUserAgent = ''

      server.use(
        http.get('https://example.com/data.txt', ({ request }) => {
          capturedUserAgent = request.headers.get('User-Agent') || ''
          return new HttpResponse('line1\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/data.txt',
        userAgent: 'CustomAgent/1.0',
      })) {
        lines.push(line)
      }

      expect(capturedUserAgent).toBe('CustomAgent/1.0')
    })

    it('should use default User-Agent when not specified', async () => {
      let capturedUserAgent = ''

      server.use(
        http.get('https://example.com/data.txt', ({ request }) => {
          capturedUserAgent = request.headers.get('User-Agent') || ''
          return new HttpResponse('line1\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/data.txt',
      })) {
        lines.push(line)
      }

      expect(capturedUserAgent).toBe(
        'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)',
      )
    })

    it('should throw error when response has no body', async () => {
      server.use(
        http.get('https://example.com/no-body', () => {
          return new HttpResponse(null, { status: 204 })
        }),
      )

      const generator = streamLines({ url: 'https://example.com/no-body' })

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _line of generator) {
          // Should not reach here
        }
      }).rejects.toThrow('Fetch returned no body')
    })

    it('should respect AbortSignal for cancellation', async () => {
      server.use(
        http.get('https://example.com/data.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return new HttpResponse('line1\nline2\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const controller = new AbortController()
      const generator = streamLines({
        url: 'https://example.com/data.txt',
        signal: controller.signal,
      })

      // Abort immediately
      controller.abort()

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _line of generator) {
          // Should not reach here
        }
      }).rejects.toThrow(/abort/i)
    })

    it('should timeout when request exceeds timeout value', async () => {
      server.use(
        http.get('https://example.com/slow', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return new HttpResponse('line1\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const generator = streamLines({
        url: 'https://example.com/slow',
        timeout: 100, // 100ms timeout
      })

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _line of generator) {
          // Should not reach here
        }
      }).rejects.toThrow()
    })

    it('should retry on 500 errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/retry-500', () => {
          attempts++
          if (attempts < 3) {
            return new HttpResponse(null, { status: 500 })
          }
          return new HttpResponse('success\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/retry-500',
        retries: 3,
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['success'])
      expect(attempts).toBe(3)
    })

    it('should retry on 429 (rate limit) errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/retry-429', () => {
          attempts++
          if (attempts < 2) {
            return new HttpResponse(null, { status: 429 })
          }
          return new HttpResponse('success\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/retry-429',
        retries: 2,
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['success'])
      expect(attempts).toBe(2)
    })

    it('should retry on 408 (timeout) errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/retry-408', () => {
          attempts++
          if (attempts < 2) {
            return new HttpResponse(null, { status: 408 })
          }
          return new HttpResponse('success\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const lines: string[] = []
      for await (const line of streamLines({
        url: 'https://example.com/retry-408',
        retries: 2,
      })) {
        lines.push(line)
      }

      expect(lines).toEqual(['success'])
      expect(attempts).toBe(2)
    })

    it('should NOT retry on 404 errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/not-found', () => {
          attempts++
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _line of streamLines({
          url: 'https://example.com/not-found',
          retries: 3,
        })) {
          // Should not reach here
        }
      }).rejects.toThrow(/404/)

      expect(attempts).toBe(1) // Should not retry
    })

    it('should NOT retry on 400 errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/bad-request', () => {
          attempts++
          return new HttpResponse(null, { status: 400 })
        }),
      )

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _line of streamLines({
          url: 'https://example.com/bad-request',
          retries: 3,
        })) {
          // Should not reach here
        }
      }).rejects.toThrow(/400/)

      expect(attempts).toBe(1) // Should not retry
    })

    it('should respect retry-after header with numeric seconds', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/retry-after-numeric', () => {
          attempts++

          if (attempts < 2) {
            return new HttpResponse(null, {
              status: 429,
              headers: { 'Retry-After': '1' }, // 1 second
            })
          }
          return new HttpResponse('success\n', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      vi.useFakeTimers()
      const promise = (async () => {
        const lines: string[] = []
        for await (const line of streamLines({
          url: 'https://example.com/retry-after-numeric',
          retries: 2,
        })) {
          lines.push(line)
        }
        return lines
      })()

      await vi.runAllTimersAsync()
      const lines = await promise
      vi.useRealTimers()

      expect(lines).toEqual(['success'])
      expect(attempts).toBe(2)
    })

    it('should throw after exhausting all retries', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/always-fails', () => {
          attempts++
          return new HttpResponse(null, { status: 500 })
        }),
      )

      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _line of streamLines({
          url: 'https://example.com/always-fails',
          retries: 2,
        })) {
          // Should not reach here
        }
      }).rejects.toThrow(/500/)

      expect(attempts).toBe(3) // Initial + 2 retries
    })
  })

  describe('fetchContent', () => {
    it('should fetch plain text content', async () => {
      server.use(
        http.get('https://example.com/content.txt', () => {
          return new HttpResponse('Hello, World!', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const content = await fetchContent({
        url: 'https://example.com/content.txt',
      })

      expect(content).toBe('Hello, World!')
    })

    it('should fetch JSON content', async () => {
      server.use(
        http.get('https://example.com/data.json', () => {
          return HttpResponse.json({ message: 'success', data: [1, 2, 3] })
        }),
      )

      const content = await fetchContent({
        url: 'https://example.com/data.json',
      })
      const parsed = JSON.parse(content)

      expect(parsed).toEqual({ message: 'success', data: [1, 2, 3] })
    })

    it('should decompress gzipped content when isGzipped is true', async () => {
      server.use(
        http.get('https://example.com/content.gz', () => {
          const gzip = createGzip()
          const readable = Readable.from(['Hello, ', 'Gzipped ', 'World!'])
          const stream = readable.pipe(gzip)

          return new HttpResponse(stream as unknown as ReadableStream, {
            headers: { 'Content-Type': 'application/gzip' },
          })
        }),
      )

      const content = await fetchContent({
        url: 'https://example.com/content.gz',
        isGzipped: true,
      })

      expect(content).toBe('Hello, Gzipped World!')
    })

    it('should use custom User-Agent header', async () => {
      let capturedUserAgent = ''

      server.use(
        http.get('https://example.com/content.txt', ({ request }) => {
          capturedUserAgent = request.headers.get('User-Agent') || ''
          return new HttpResponse('content', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      await fetchContent({
        url: 'https://example.com/content.txt',
        userAgent: 'CustomAgent/2.0',
      })

      expect(capturedUserAgent).toBe('CustomAgent/2.0')
    })

    it('should use default User-Agent when not specified', async () => {
      let capturedUserAgent = ''

      server.use(
        http.get('https://example.com/content.txt', ({ request }) => {
          capturedUserAgent = request.headers.get('User-Agent') || ''
          return new HttpResponse('content', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      await fetchContent({ url: 'https://example.com/content.txt' })

      expect(capturedUserAgent).toBe(
        'Pulsarr/1.0 (+https://github.com/jamcalli/pulsarr)',
      )
    })

    it('should throw error when gzipped response has no body', async () => {
      server.use(
        http.get('https://example.com/no-body.gz', () => {
          return new HttpResponse(null, { status: 204 })
        }),
      )

      await expect(
        fetchContent({
          url: 'https://example.com/no-body.gz',
          isGzipped: true,
        }),
      ).rejects.toThrow('Fetch returned no body')
    })

    it('should respect AbortSignal for cancellation', async () => {
      server.use(
        http.get('https://example.com/content.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          return new HttpResponse('content', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const controller = new AbortController()
      const promise = fetchContent({
        url: 'https://example.com/content.txt',
        signal: controller.signal,
      })

      // Abort immediately
      controller.abort()

      await expect(promise).rejects.toThrow(/abort/i)
    })

    it('should timeout when request exceeds timeout value', async () => {
      server.use(
        http.get('https://example.com/slow.txt', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return new HttpResponse('content', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      await expect(
        fetchContent({
          url: 'https://example.com/slow.txt',
          timeout: 100, // 100ms timeout
        }),
      ).rejects.toThrow()
    })

    it('should retry on 500 errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/retry-500', () => {
          attempts++
          if (attempts < 3) {
            return new HttpResponse(null, { status: 500 })
          }
          return new HttpResponse('success', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const content = await fetchContent({
        url: 'https://example.com/retry-500',
        retries: 3,
      })

      expect(content).toBe('success')
      expect(attempts).toBe(3)
    })

    it('should NOT retry on 404 errors', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/not-found', () => {
          attempts++
          return new HttpResponse(null, { status: 404 })
        }),
      )

      await expect(
        fetchContent({
          url: 'https://example.com/not-found',
          retries: 3,
        }),
      ).rejects.toThrow(/404/)

      expect(attempts).toBe(1) // Should not retry
    })

    it('should throw after exhausting all retries', async () => {
      let attempts = 0

      server.use(
        http.get('https://example.com/always-fails', () => {
          attempts++
          return new HttpResponse(null, { status: 500 })
        }),
      )

      await expect(
        fetchContent({
          url: 'https://example.com/always-fails',
          retries: 2,
        }),
      ).rejects.toThrow(/500/)

      expect(attempts).toBe(3) // Initial + 2 retries
    })

    it('should handle large content efficiently', async () => {
      const largeContent = 'x'.repeat(1024 * 1024) // 1MB of 'x'

      server.use(
        http.get('https://example.com/large.txt', () => {
          return new HttpResponse(largeContent, {
            headers: { 'Content-Type': 'text/plain' },
          })
        }),
      )

      const content = await fetchContent({
        url: 'https://example.com/large.txt',
      })

      expect(content).toBe(largeContent)
      expect(content.length).toBe(1024 * 1024)
    })
  })
})
