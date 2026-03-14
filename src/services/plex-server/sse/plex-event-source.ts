/**
 * Plex SSE Event Source
 *
 * Manages a persistent SSE connection to the Plex server's notification
 * endpoint. Parses incoming events and re-emits them as typed domain events
 * via a composed EventEmitter.
 */

import { EventEmitter } from 'node:events'
import type {
  PlexPlaySessionNotification,
  PlexReachabilityNotification,
  PlexTimelineEntry,
} from '@root/types/plex-session.types.js'
import { EventSource } from 'eventsource'
import type { FastifyBaseLogger } from 'fastify'

// Plex wraps some event payloads in a NotificationContainer envelope
interface NotificationContainer {
  NotificationContainer: {
    type: string
    size: number
    PlaySessionStateNotification?: PlexPlaySessionNotification[]
    TimelineEntry?: PlexTimelineEntry[]
    ReachabilityNotification?: PlexReachabilityNotification[]
  }
}

type SSEHandler = (evt: MessageEvent) => void

// Typed event map for the internal emitter
export interface PlexSSEEventMap {
  playing: [PlexPlaySessionNotification[]]
  timeline: [PlexTimelineEntry[]]
  reachability: [PlexReachabilityNotification[]]
  connected: []
  disconnected: []
}

// Reconnection timing constants
const HEARTBEAT_TIMEOUT_MS = 30_000
const CONNECTION_TIMEOUT_MS = 30_000
const MAX_BACKOFF_MS = 30_000
const INITIAL_BACKOFF_MS = 1_000
const STABLE_CONNECTION_MS = 60_000

export interface PlexEventSourceConfig {
  serverUrl: string
  token: string
  logger: FastifyBaseLogger
}

export class PlexEventSource {
  private readonly emitter = new EventEmitter()
  private readonly log: FastifyBaseLogger
  private readonly serverUrl: string
  private readonly token: string

  private es: EventSource | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private connectionTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoffMs = INITIAL_BACKOFF_MS
  private connectedSince: number | null = null
  private shutdownRequested = false

  // Track bound listener references so we can remove them on cleanup.
  // EventSource.close() does not remove listeners added via addEventListener.
  private boundListeners: Array<{
    type: string
    handler: SSEHandler
  }> = []

  constructor(config: PlexEventSourceConfig) {
    this.serverUrl = config.serverUrl
    this.token = config.token
    this.log = config.logger
    this.emitter.setMaxListeners(50)
  }

  // -- Public API --

  async connect(): Promise<void> {
    if (this.shutdownRequested) return
    this.createConnection()
  }

  disconnect(): void {
    this.shutdownRequested = true
    this.cleanup()
  }

  isConnected(): boolean {
    return this.es?.readyState === EventSource.OPEN
  }

  on<K extends keyof PlexSSEEventMap>(
    event: K,
    handler: (...args: PlexSSEEventMap[K]) => void,
  ): void {
    this.emitter.on(event, handler)
  }

  off<K extends keyof PlexSSEEventMap>(
    event: K,
    handler: (...args: PlexSSEEventMap[K]) => void,
  ): void {
    this.emitter.off(event, handler)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
  }

  // -- Connection lifecycle --

  private createConnection(): void {
    this.cleanup()
    if (this.shutdownRequested) return

    const url = `${this.serverUrl}/:/eventsource/notifications`
    this.log.info('Opening SSE connection to Plex')

    this.es = new EventSource(url, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...init.headers,
            'X-Plex-Token': this.token,
          },
        }),
    })

    // Bind listeners and track references for cleanup
    this.addSSEListener('open', this.handleOpen.bind(this))
    this.addSSEListener('error', this.handleError.bind(this))
    this.addSSEListener('message', this.handleMessage.bind(this))
    this.addSSEListener('playing', this.handlePlaying.bind(this))
    this.addSSEListener('ping', this.handlePing.bind(this))

    // If stuck in CONNECTING for too long, force a reconnect
    this.connectionTimer = setTimeout(() => {
      if (this.es && this.es.readyState === EventSource.CONNECTING) {
        this.log.warn(
          'SSE connection stuck in CONNECTING state, forcing reconnect',
        )
        this.scheduleReconnect()
      }
    }, CONNECTION_TIMEOUT_MS)
  }

  private addSSEListener(type: string, handler: SSEHandler): void {
    if (!this.es) return
    this.es.addEventListener(type, handler)
    this.boundListeners.push({ type, handler })
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.es) {
      // Remove all tracked listeners before closing
      for (const { type, handler } of this.boundListeners) {
        this.es.removeEventListener(type, handler)
      }
      this.boundListeners = []
      this.es.close()
      this.es = null
    }
    this.connectedSince = null
  }

  private resetHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
    }
    this.heartbeatTimer = setTimeout(() => {
      this.log.warn('SSE heartbeat timeout - no events received in 30s')
      this.emitter.emit('disconnected')
      this.scheduleReconnect()
    }, HEARTBEAT_TIMEOUT_MS)
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested) return

    this.cleanup()

    // Add jitter (0-25% of backoff) to avoid thundering herd
    const jitter = Math.random() * this.backoffMs * 0.25
    const delay = this.backoffMs + jitter

    this.log.info({ delayMs: Math.round(delay) }, 'Scheduling SSE reconnect')

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.shutdownRequested) {
        this.createConnection()
      }
    }, delay)

    // Increase backoff for next attempt, capped at max
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
  }

  // -- Event handlers --

  private handleOpen(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }
    this.connectedSince = Date.now()
    this.log.info('SSE connection to Plex established')
    this.resetHeartbeat()
    this.emitter.emit('connected')
  }

  private handleError(): void {
    // The eventsource package auto-reconnects on errors, but we manage our
    // own reconnection logic for more control over backoff and heartbeat.
    this.log.warn('SSE connection error')
    this.emitter.emit('disconnected')
    this.scheduleReconnect()
  }

  private handlePing(): void {
    this.resetHeartbeat()
    this.maybeResetBackoff()
  }

  private handleMessage(evt: MessageEvent): void {
    this.resetHeartbeat()
    this.maybeResetBackoff()

    try {
      const data = JSON.parse(String(evt.data)) as NotificationContainer
      const container = data.NotificationContainer
      if (!container) return

      this.dispatchContainer(container)
    } catch {
      this.log.debug('Failed to parse SSE message data')
    }
  }

  private handlePlaying(evt: MessageEvent): void {
    this.resetHeartbeat()
    this.maybeResetBackoff()

    try {
      // Plex SSE playing events are always {"PlaySessionStateNotification": {...}}
      const data = JSON.parse(String(evt.data)) as {
        PlaySessionStateNotification: PlexPlaySessionNotification
      }
      this.emitter.emit('playing', [data.PlaySessionStateNotification])
    } catch {
      this.log.debug('Failed to parse SSE playing event data')
    }
  }

  // Reset backoff after a sustained connection (not just on first open)
  private maybeResetBackoff(): void {
    if (
      this.connectedSince &&
      Date.now() - this.connectedSince >= STABLE_CONNECTION_MS
    ) {
      this.backoffMs = INITIAL_BACKOFF_MS
    }
  }

  private dispatchContainer(
    container: NotificationContainer['NotificationContainer'],
  ): void {
    if (container.PlaySessionStateNotification) {
      this.emitter.emit('playing', container.PlaySessionStateNotification)
    }
    if (container.TimelineEntry) {
      this.emitter.emit('timeline', container.TimelineEntry)
    }
    if (container.ReachabilityNotification) {
      this.emitter.emit('reachability', container.ReachabilityNotification)
    }
  }
}
