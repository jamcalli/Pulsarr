import { Writable } from 'node:stream'
import {
  LOG_FILE_REOPEN_DELAY_MS,
  LogFileDestination,
} from '@utils/log-file-destination.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function memoryFile(): { stream: Writable; lines: string[] } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString())
      done()
    },
  })
  return { stream, lines }
}

async function fail(stream: Writable): Promise<void> {
  const closed = new Promise<void>((resolve) =>
    stream.once('close', () => resolve()),
  )
  stream.destroy(new Error('disk gone'))
  await closed
}

describe('LogFileDestination', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes to the open file', () => {
    const file = memoryFile()
    const destination = new LogFileDestination({
      initial: file.stream,
      open: vi.fn(),
      fallback: vi.fn(),
    })

    destination.write('one\n')

    expect(file.lines).toEqual(['one\n'])
  })

  it('reopens after the delay once the file errors', async () => {
    const first = memoryFile()
    const second = memoryFile()
    const open = vi.fn(() => second.stream)
    const destination = new LogFileDestination({
      initial: first.stream,
      open,
      fallback: vi.fn(),
    })

    await fail(first.stream)
    await vi.advanceTimersByTimeAsync(LOG_FILE_REOPEN_DELAY_MS - 1)
    expect(open).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(open).toHaveBeenCalledTimes(1)

    destination.write('after reopen\n')
    expect(second.lines).toEqual(['after reopen\n'])
  })

  it('keeps retrying while reopening fails', async () => {
    const first = memoryFile()
    const broken = memoryFile()
    const healthy = memoryFile()
    const open = vi
      .fn<() => Writable>()
      .mockImplementationOnce(() => {
        throw new Error('no directory')
      })
      .mockImplementationOnce(() => broken.stream)
      .mockImplementationOnce(() => healthy.stream)
    const destination = new LogFileDestination({
      initial: first.stream,
      open,
      fallback: vi.fn(),
    })

    await fail(first.stream)
    await vi.advanceTimersByTimeAsync(LOG_FILE_REOPEN_DELAY_MS)
    await vi.advanceTimersByTimeAsync(LOG_FILE_REOPEN_DELAY_MS)
    await fail(broken.stream)
    await vi.advanceTimersByTimeAsync(LOG_FILE_REOPEN_DELAY_MS)

    expect(open).toHaveBeenCalledTimes(3)
    destination.write('recovered\n')
    expect(healthy.lines).toEqual(['recovered\n'])
  })

  it('sends lines to the fallback while the file is down', async () => {
    const file = memoryFile()
    const fallback = vi.fn()
    const destination = new LogFileDestination({
      initial: file.stream,
      open: vi.fn(() => memoryFile().stream),
      fallback,
    })

    await fail(file.stream)
    destination.write('while down\n')

    expect(fallback).toHaveBeenCalledWith('while down\n')
    expect(file.lines).toEqual([])
  })

  it('drops lines while down when the fallback discards them', async () => {
    const file = memoryFile()
    const destination = new LogFileDestination({
      initial: file.stream,
      open: vi.fn(() => memoryFile().stream),
      fallback: () => {},
    })

    await fail(file.stream)

    expect(() => destination.write('dropped\n')).not.toThrow()
    expect(file.lines).toEqual([])
  })

  it('cancels a pending reopen when ended', async () => {
    const file = memoryFile()
    const open = vi.fn(() => memoryFile().stream)
    const fallback = vi.fn()
    const destination = new LogFileDestination({
      initial: file.stream,
      open,
      fallback,
    })

    await fail(file.stream)
    await destination.end()
    await vi.advanceTimersByTimeAsync(LOG_FILE_REOPEN_DELAY_MS * 2)

    expect(open).not.toHaveBeenCalled()
    destination.write('late\n')
    expect(fallback).toHaveBeenCalledWith('late\n')
  })

  it('resolves end once the file has finished', async () => {
    const file = memoryFile()
    const destination = new LogFileDestination({
      initial: file.stream,
      open: vi.fn(),
      fallback: vi.fn(),
    })

    destination.write('last\n')
    await destination.end()

    expect(file.stream.writableFinished).toBe(true)
    expect(file.lines).toEqual(['last\n'])
  })

  it('holds every end call until the file has finished', async () => {
    let finishFile = () => {}
    const stream = new Writable({
      write(_chunk, _encoding, done) {
        done()
      },
      final(done) {
        finishFile = () => done()
      },
    })
    const destination = new LogFileDestination({
      initial: stream,
      open: vi.fn(),
      fallback: vi.fn(),
    })
    const settled: string[] = []

    const first = destination.end().then(() => settled.push('first'))
    const second = destination.end().then(() => settled.push('second'))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toEqual([])

    finishFile()
    await Promise.all([first, second])

    expect(settled).toEqual(['first', 'second'])
    expect(stream.writableFinished).toBe(true)
  })
})
