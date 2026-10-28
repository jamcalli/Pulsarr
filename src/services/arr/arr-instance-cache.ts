import type { ArrClient } from '@services/arr/arr-client.js'
import type { FastifyBaseLogger } from 'fastify'

export const ARR_RESOURCE_CACHE_TTL_MS = 30_000

/** Reads the owning service's live state, so a cache built before initialize sees the configured client. */
export interface ArrInstanceContext {
  readonly appName: string
  readonly log: FastifyBaseLogger
  client(): ArrClient
  instanceId(): number | undefined
}

/** Caches one arr resource per instance id for the TTL and serves the last value when a refresh fails. */
export class ArrInstanceCache<T> {
  private readonly entries = new Map<number, { value: T; expiresAt: number }>()

  constructor(
    private readonly instance: ArrInstanceContext,
    private readonly label: string,
    private readonly load: () => Promise<T>,
  ) {}

  async read(): Promise<T> {
    const instanceId = this.instance.instanceId()
    if (!instanceId) return this.load()
    const entry = this.entries.get(instanceId)
    if (entry && Date.now() < entry.expiresAt) return entry.value
    try {
      const value = await this.load()
      this.entries.set(instanceId, {
        value,
        expiresAt: Date.now() + ARR_RESOURCE_CACHE_TTL_MS,
      })
      return value
    } catch (error) {
      if (!entry) throw error
      this.instance.log.warn(
        { error, instanceId },
        `Using stale ${this.label} cache for ${this.instance.appName} instance ${instanceId}`,
      )
      return entry.value
    }
  }

  invalidate(): void {
    const instanceId = this.instance.instanceId()
    if (instanceId) this.entries.delete(instanceId)
  }
}
