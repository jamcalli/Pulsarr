import type { ProgressEvent } from '@root/types/progress.types.js'
import { type ProgressStream, startAndAwaitStatus } from '@/lib/background-job'

interface Status {
  state: 'running' | 'done' | 'failed'
}

function fakeStream() {
  const listeners = new Map<string, Set<(event: ProgressEvent) => void>>()
  const reconnects = new Set<() => void>()
  const stream: ProgressStream = {
    onEvent: (type, callback) => {
      const set = listeners.get(type) ?? new Set()
      set.add(callback)
      listeners.set(type, set)
      return () => set.delete(callback)
    },
    onReconnect: (callback) => {
      reconnects.add(callback)
      return () => reconnects.delete(callback)
    },
  }
  const emit = (
    type: ProgressEvent['type'],
    phase: string,
    metadata?: ProgressEvent['metadata'],
  ) => {
    for (const callback of listeners.get(type) ?? []) {
      callback({
        operationId: type,
        type,
        phase,
        progress: 100,
        message: '',
        metadata,
      })
    }
  }
  const reconnect = () => {
    for (const callback of reconnects) callback()
  }
  const subscribers = () =>
    [...listeners.values()].reduce((sum, set) => sum + set.size, 0) +
    reconnects.size
  return { stream, emit, reconnect, subscribers }
}

function job(reads: Status[]) {
  const readStatus = vi.fn(
    async (): Promise<Status> => reads.shift() ?? { state: 'running' },
  )
  return {
    readStatus,
    options: {
      eventType: 'delete-sync-dry-run' as const,
      start: vi.fn(async () => undefined),
      readStatus,
      isSettled: (status: Status) => status.state !== 'running',
    },
  }
}

describe('startAndAwaitStatus', () => {
  it('resolves with a status that is already settled after the start', async () => {
    const { stream, subscribers } = fakeStream()
    const { options } = job([{ state: 'done' }])

    await expect(startAndAwaitStatus(options, stream)).resolves.toEqual({
      state: 'done',
    })
    expect(options.start).toHaveBeenCalledOnce()
    expect(subscribers()).toBe(0)
  })

  it('rereads on a settled event of the job and resolves failed too', async () => {
    const { stream, emit } = fakeStream()
    const { options, readStatus } = job([
      { state: 'running' },
      { state: 'failed' },
    ])

    const result = startAndAwaitStatus(options, stream)
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(1))
    emit('delete-sync-dry-run', 'complete')

    await expect(result).resolves.toEqual({ state: 'failed' })
  })

  it('rereads when the stream reconnects', async () => {
    const { stream, reconnect } = fakeStream()
    const { options, readStatus } = job([
      { state: 'running' },
      { state: 'done' },
    ])

    const result = startAndAwaitStatus(options, stream)
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(1))
    reconnect()

    await expect(result).resolves.toEqual({ state: 'done' })
  })

  it('ignores progress phases, other event types and other jobs', async () => {
    const { stream, emit } = fakeStream()
    const { options, readStatus } = job([{ state: 'running' }])
    void startAndAwaitStatus(
      {
        ...options,
        eventType: 'scheduled-job',
        isJobEvent: (event) =>
          event.metadata !== undefined &&
          'job' in event.metadata &&
          event.metadata.job === 'delete-sync',
      },
      stream,
    )
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(1))

    emit('scheduled-job', 'running', { job: 'delete-sync' })
    emit('scheduled-job', 'complete', { job: 'quota-maintenance' })
    emit('delete-sync-dry-run', 'complete')
    await Promise.resolve()

    expect(readStatus).toHaveBeenCalledTimes(1)
  })

  it('ignores events from before the start was accepted', async () => {
    const { stream, emit } = fakeStream()
    let accept: () => void = () => undefined
    const { options, readStatus } = job([{ state: 'done' }])
    options.start.mockReturnValue(
      new Promise<undefined>((resolve) => {
        accept = () => resolve(undefined)
      }),
    )

    const result = startAndAwaitStatus(options, stream)
    emit('delete-sync-dry-run', 'complete')
    expect(readStatus).not.toHaveBeenCalled()

    accept()
    await expect(result).resolves.toEqual({ state: 'done' })
  })

  it('rejects with the start error and unsubscribes', async () => {
    const { stream, subscribers } = fakeStream()
    const { options, readStatus } = job([])
    options.start.mockRejectedValue({ message: 'already running' })

    await expect(startAndAwaitStatus(options, stream)).rejects.toEqual({
      message: 'already running',
    })
    expect(readStatus).not.toHaveBeenCalled()
    expect(subscribers()).toBe(0)
  })
})
