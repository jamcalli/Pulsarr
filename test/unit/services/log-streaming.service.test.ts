import type * as FsPromises from 'node:fs/promises'
import {
  appendFile,
  type FileHandle,
  type FileReadResult,
  mkdir,
  mkdtemp,
  open,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LogEntry } from '@root/types/logs.types.js'
import { LogStreamingService } from '@services/log-streaming.service.js'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  return { ...actual, open: vi.fn(actual.open), stat: vi.fn(actual.stat) }
})

const actualFs = await vi.importActual<typeof FsPromises>('node:fs/promises')

const PREVIOUS_TAIL_LIMIT_BYTES = 256 * 1024

function pinoLine(msg: string): string {
  return `${JSON.stringify({ level: 30, time: 0, msg })}\n`
}

describe('LogStreamingService', () => {
  let dataDir: string
  let logFile: string
  let service: LogStreamingService
  const previousDataDir = process.env.dataDir

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'log-streaming-'))
    process.env.dataDir = dataDir
    await mkdir(join(dataDir, 'logs'))
    logFile = join(dataDir, 'logs', 'pulsarr-current.log')
    service = new LogStreamingService(createMockLogger())
  })

  afterEach(() => {
    service.shutdown()
    vi.mocked(open).mockImplementation(actualFs.open)
    vi.mocked(stat).mockImplementation(actualFs.stat)
  })

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.dataDir
    else process.env.dataDir = previousDataDir
    await rm(dataDir, { recursive: true, force: true })
  })

  function follow(target = service): string[] {
    const messages: string[] = []
    target
      .getEventEmitter()
      .on('log', (entry: LogEntry) => messages.push(entry.message))
    target.addConnection('test', { tail: 0, follow: true })
    return messages
  }

  async function messagesOf(lines: number): Promise<string[]> {
    return (await service.getTailLines(lines)).map((entry) => entry.message)
  }

  async function waitForWatch(messages: string[]): Promise<void> {
    const marker = `ready-${messages.length}`
    await vi.waitFor(
      async () => {
        await appendFile(logFile, pinoLine(marker))
        expect(messages).toContain(marker)
      },
      { timeout: 5_000, interval: 1_100 },
    )
  }

  describe('getTailLines', () => {
    it('drops the cut first line when the tail starts mid-file', async () => {
      const lines = Array.from({ length: 5_000 }, (_, i) =>
        pinoLine(`line-${String(i).padStart(5, '0')}-${'x'.repeat(60)}`),
      )
      await writeFile(logFile, lines.join(''))

      const messages = await messagesOf(100)

      expect(messages).toHaveLength(100)
      for (const message of messages) {
        expect(message).toMatch(/^line-\d{5}-x+$/)
      }
      expect(messages[0]).toContain('line-04900')
      expect(messages.at(-1)).toContain('line-04999')
    })

    it('returns 1000 lines in order when they span more than 256 KB', async () => {
      const messages = Array.from(
        { length: 2_000 },
        (_, i) => `line-${String(i).padStart(5, '0')}-${'x'.repeat(400)}`,
      )
      const content = messages.map(pinoLine).join('')
      const lastThousand = messages.slice(-1_000)
      expect(
        Buffer.byteLength(lastThousand.map(pinoLine).join('')),
      ).toBeGreaterThan(PREVIOUS_TAIL_LIMIT_BYTES)
      await writeFile(logFile, content)

      expect(await messagesOf(1_000)).toEqual(lastThousand)
    })

    it('returns every line of a file shorter than the request', async () => {
      const messages = ['first', 'second', 'third']
      await writeFile(logFile, messages.map(pinoLine).join(''))

      expect(await messagesOf(100)).toEqual(messages)
    })

    it('skips blank lines without returning fewer than requested', async () => {
      const messages = Array.from({ length: 50 }, (_, i) => `entry-${i}`)
      await writeFile(
        logFile,
        messages.map((message) => `${pinoLine(message)}\n\n`).join(''),
      )

      expect(await messagesOf(20)).toEqual(messages.slice(-20))
    })

    it('keeps multi-byte characters intact across read chunk boundaries', async () => {
      let wide = 'é'.repeat(100_000)
      const build = () =>
        Buffer.from(pinoLine('before') + pinoLine(wide) + pinoLine('after'))
      let content = build()
      // An odd distance from the end puts every even-sized chunk boundary inside a character
      if ((content.length - content.indexOf(0xc3)) % 2 === 0) {
        wide += 'x'
        content = build()
      }
      await writeFile(logFile, content)

      expect(await messagesOf(2)).toEqual([wide, 'after'])
    })

    it('returns only whole lines when the read stops at its byte cap', async () => {
      const line = (i: number) =>
        pinoLine(`big-${String(i).padStart(4, '0')}-${'y'.repeat(10_000)}`)
      await writeFile(
        logFile,
        Array.from({ length: 1_000 }, (_, i) => line(i)).join(''),
      )

      const messages = await messagesOf(1_000)

      expect(messages.length).toBeGreaterThan(0)
      expect(messages.length).toBeLessThan(1_000)
      for (const message of messages) {
        expect(message).toMatch(/^big-\d{4}-y{10000}$/)
      }
      expect(messages.at(-1)).toContain('big-0999')
    })
  })

  describe('live follow', () => {
    it('emits lines written to the new file after a rotation', async () => {
      await writeFile(logFile, pinoLine(`old ${'x'.repeat(200)}`).repeat(20))
      const messages = follow()
      await waitForWatch(messages)

      await writeFile(logFile, pinoLine('after rotation'))

      await vi.waitFor(() => expect(messages).toContain('after rotation'), {
        timeout: 5_000,
      })
    })

    it('decodes a multi-byte character split across two reads', async () => {
      await writeFile(logFile, '')
      const messages = follow()
      await waitForWatch(messages)

      const line = Buffer.from(pinoLine('café'))
      const split = line.indexOf(0xc3) + 1
      await appendFile(
        logFile,
        Buffer.concat([
          Buffer.from(pinoLine('first half')),
          line.subarray(0, split),
        ]),
      )
      await vi.waitFor(() => expect(messages).toContain('first half'), {
        timeout: 5_000,
      })
      await appendFile(logFile, line.subarray(split))

      await vi.waitFor(() => expect(messages).toContain('café'), {
        timeout: 5_000,
      })
    })
    it('emits a large single append completely and in order', async () => {
      await writeFile(logFile, '')
      const messages = follow()
      await waitForWatch(messages)

      const appended = Array.from(
        { length: 3_000 },
        (_, i) => `bulk-${String(i).padStart(4, '0')}-${'z'.repeat(400)}`,
      )
      await appendFile(logFile, appended.map(pinoLine).join(''))

      await vi.waitFor(() => expect(messages.at(-1)).toBe(appended.at(-1)), {
        timeout: 5_000,
      })
      expect(messages.filter((m) => m.startsWith('bulk-'))).toEqual(appended)
    })

    it('starts watching for a later connection after a failed start', async () => {
      await writeFile(logFile, '')
      vi.mocked(stat).mockRejectedValueOnce(
        Object.assign(new Error('permission denied'), { code: 'EACCES' }),
      )
      service.addConnection('failed', { tail: 0, follow: true })
      await new Promise((resolve) => setImmediate(resolve))

      const messages = follow()

      await waitForWatch(messages)
    })

    it('drops a read that finishes after the watcher stopped', async () => {
      await writeFile(logFile, '')
      const messages = follow()
      await waitForWatch(messages)

      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const reads: Promise<FileReadResult<Buffer>>[] = []
      vi.mocked(open).mockImplementation(async (path, flags) => {
        const handle = await actualFs.open(path, flags)
        const gatedRead = (
          buffer: Buffer,
          offset: number,
          length: number,
          position: number,
        ) => {
          const pending = gate.then(() =>
            handle.read(buffer, offset, length, position),
          )
          reads.push(pending)
          return pending
        }
        return new Proxy(handle, {
          get(target, property) {
            if (property === 'read') return gatedRead
            const value: FileHandle[keyof FileHandle] = Reflect.get(
              target,
              property,
            )
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      })
      await appendFile(logFile, pinoLine('after stop'))
      await vi.waitFor(() => expect(reads.length).toBeGreaterThan(0), {
        timeout: 5_000,
      })

      service.removeConnection('test')
      release()
      await Promise.all(reads)
      await new Promise((resolve) => setImmediate(resolve))

      expect(messages).not.toContain('after stop')
    })

    it('keeps two service instances independent', async () => {
      await writeFile(logFile, '')
      const other = new LogStreamingService(createMockLogger())
      try {
        const mine = follow()
        const theirs = follow(other)
        await waitForWatch(mine)
        await vi.waitFor(() => expect(theirs.length).toBeGreaterThan(0), {
          timeout: 5_000,
        })

        service.removeConnection('test')
        await appendFile(logFile, pinoLine('only other'))

        await vi.waitFor(() => expect(theirs).toContain('only other'), {
          timeout: 5_000,
        })
        expect(mine).not.toContain('only other')
      } finally {
        other.shutdown()
      }
    })
  })
})
