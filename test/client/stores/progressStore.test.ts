import type { ProgressEvent } from '@root/types/progress.types.js'
import { useProgressStore } from '@/stores/progressStore'

class FakeEventSource {
  static latest: FakeEventSource | null = null
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    FakeEventSource.latest = this
  }

  close() {}
}

function connect() {
  useProgressStore.getState().initialize()
  const source = FakeEventSource.latest
  if (!source) throw new Error('No event source opened')
  return {
    open: () => source.onopen?.(),
    send: (event: ProgressEvent) =>
      source.onmessage?.({ data: JSON.stringify(event) }),
  }
}

function syncEvent(
  type: 'self-watchlist' | 'others-watchlist',
  progress: number,
): ProgressEvent {
  return {
    operationId: `${type}-1`,
    type,
    phase: 'reading',
    progress,
    message: `Reading ${progress}`,
    metadata: { stage: 'reading', count: null },
  }
}

const PLEX_STATUS: ProgressEvent = {
  operationId: 'plex-sse-status',
  type: 'system',
  phase: 'info',
  progress: 0,
  message: 'Plex SSE status',
  metadata: { status: 'connected' },
}

describe('progressStore', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource)
    FakeEventSource.latest = null
    useProgressStore.setState({
      eventSource: null,
      isConnecting: false,
      hasGivenUp: false,
      systemStatusCache: {},
      watchlistSyncCache: {},
    })
  })

  afterEach(() => {
    useProgressStore.getState().cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps the latest watchlist sync event of each type', () => {
    const stream = connect()
    stream.open()
    stream.send(syncEvent('self-watchlist', 10))
    stream.send(syncEvent('others-watchlist', 20))
    stream.send(syncEvent('self-watchlist', 40))

    expect(useProgressStore.getState().watchlistSyncCache).toEqual({
      'self-watchlist': syncEvent('self-watchlist', 40),
      'others-watchlist': syncEvent('others-watchlist', 20),
    })
  })

  it('clears the watchlist sync events when the stream opens again', () => {
    const stream = connect()
    stream.open()
    stream.send(syncEvent('others-watchlist', 20))

    stream.open()

    expect(useProgressStore.getState().watchlistSyncCache).toEqual({})
  })

  it('keeps system events by operation across a reopen', () => {
    const stream = connect()
    stream.open()
    stream.send(PLEX_STATUS)
    stream.open()

    expect(useProgressStore.getState().systemStatusCache).toEqual({
      'plex-sse-status': PLEX_STATUS,
    })
    expect(useProgressStore.getState().watchlistSyncCache).toEqual({})
  })
})
