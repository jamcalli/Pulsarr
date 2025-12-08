/**
 * Deferred Routing Queue Service
 *
 * Queues failed routing attempts when Sonarr/Radarr instances are unavailable
 * and retries when instances recover. This ensures items aren't lost between
 * cold starts when periodic full sync is disabled.
 *
 * Design principles:
 * - In-memory only: Cold start runs full sync first, queue starts empty
 * - Simple collection: Queue items instead of discarding on health check failure
 * - Retry through same entry points: Queued items replay through routing functions
 * - No retry limits: Keep trying until instances recover or app restarts
 */

import type { EtagPollResult, Item } from '@root/types/plex.types.js'
import type { FastifyBaseLogger } from 'fastify'
import type { RadarrManagerService } from './radarr-manager.service.js'
import type { SonarrManagerService } from './sonarr-manager.service.js'

/**
 * Entry types for the deferred queue.
 * Each routing path has different input types - store what's needed to retry each.
 */
export type DeferredEntry =
  | { type: 'etag'; change: EtagPollResult }
  | { type: 'newFriend'; userId: number; items: Item[] }

/**
 * Callbacks for routing different entry types
 */
export interface DeferredRoutingCallbacks {
  /** Route items from ETag change detection */
  routeEtagChange: (change: EtagPollResult) => Promise<void>
  /** Route items for a new friend */
  routeNewFriendItems: (userId: number, items: Item[]) => Promise<void>
  /** Called after queue is fully drained */
  onDrained: () => void
}

/**
 * Dependencies for the deferred routing queue
 */
export interface DeferredRoutingQueueDeps {
  sonarrManager: SonarrManagerService
  radarrManager: RadarrManagerService
  callbacks: DeferredRoutingCallbacks
  log: FastifyBaseLogger
}

/** Health check interval: 2 minutes */
const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000

/**
 * Deferred Routing Queue
 *
 * Queues routing attempts that fail due to instance unavailability
 * and retries when instances recover.
 */
export class DeferredRoutingQueue {
  private queue: DeferredEntry[] = []
  private healthCheckTimer: NodeJS.Timeout | null = null
  private readonly sonarrManager: SonarrManagerService
  private readonly radarrManager: RadarrManagerService
  private readonly callbacks: DeferredRoutingCallbacks
  private readonly log: FastifyBaseLogger

  constructor(deps: DeferredRoutingQueueDeps) {
    this.sonarrManager = deps.sonarrManager
    this.radarrManager = deps.radarrManager
    this.callbacks = deps.callbacks
    this.log = deps.log
  }

  /**
   * Start the health check timer for periodic queue drain attempts
   */
  start(): void {
    if (this.healthCheckTimer) {
      return // Already running
    }

    this.healthCheckTimer = setInterval(
      () => this.checkHealthAndDrain(),
      HEALTH_CHECK_INTERVAL_MS,
    )

    this.log.info('Deferred routing queue started')
  }

  /**
   * Stop the health check timer and clear the queue
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    const queueSize = this.queue.length
    this.queue = []

    if (queueSize > 0) {
      this.log.info(
        { droppedItems: queueSize },
        'Deferred routing queue stopped, items dropped',
      )
    } else {
      this.log.info('Deferred routing queue stopped')
    }
  }

  /**
   * Add an entry to the deferred queue
   */
  enqueue(entry: DeferredEntry): void {
    this.queue.push(entry)
    this.log.info(
      { type: entry.type, queueSize: this.queue.length },
      'Queued items for deferred routing',
    )
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length
  }

  /**
   * Check if queue has items
   */
  hasItems(): boolean {
    return this.queue.length > 0
  }

  /**
   * Check instance health and drain queue if all instances are healthy
   */
  private async checkHealthAndDrain(): Promise<void> {
    if (this.queue.length === 0) {
      return
    }

    this.log.debug(
      { queueSize: this.queue.length },
      'Checking instance health for queue drain',
    )

    // Check health of all instances
    const [sonarrHealth, radarrHealth] = await Promise.all([
      this.sonarrManager.checkInstancesHealth(),
      this.radarrManager.checkInstancesHealth(),
    ])

    // Only drain when ALL instances are healthy
    // We require all instances to be available to ensure correct routing decisions
    if (
      sonarrHealth.unavailable.length > 0 ||
      radarrHealth.unavailable.length > 0
    ) {
      this.log.debug(
        {
          queueSize: this.queue.length,
          sonarrUnavailable: sonarrHealth.unavailable,
          radarrUnavailable: radarrHealth.unavailable,
        },
        'Instances still unavailable, keeping queue',
      )
      return
    }

    this.log.info(
      { queueSize: this.queue.length },
      'All instances healthy, draining deferred queue',
    )

    // Take all items from queue and clear it
    const toProcess = [...this.queue]
    this.queue = []

    // Process all queued items through their original entry points
    for (const entry of toProcess) {
      try {
        switch (entry.type) {
          case 'etag':
            await this.callbacks.routeEtagChange(entry.change)
            break
          case 'newFriend':
            await this.callbacks.routeNewFriendItems(entry.userId, entry.items)
            break
        }
      } catch (error) {
        // If routing fails again, re-queue the entry
        this.log.warn(
          { type: entry.type, error },
          'Deferred routing failed, re-queuing',
        )
        this.queue.push(entry)
      }
    }

    // If queue is fully drained, notify caller
    if (this.queue.length === 0) {
      this.log.info('Deferred queue fully drained')
      this.callbacks.onDrained()
    } else {
      this.log.info(
        { remaining: this.queue.length },
        'Deferred queue partially drained, some items re-queued',
      )
    }
  }
}
