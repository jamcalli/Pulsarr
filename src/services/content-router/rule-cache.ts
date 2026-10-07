import type { RouterRule } from '@root/types/router.types.js'
import type { FastifyBaseLogger } from 'fastify'

export class RuleCache {
  private cache: RouterRule[] | null = null
  private inFlight: Promise<RouterRule[]> | null = null
  private generation = 0

  constructor(
    private readonly fetch: () => Promise<RouterRule[]>,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Rejects when the fetch fails, and a failed fetch is never cached. */
  async get(): Promise<RouterRule[]> {
    if (this.cache) {
      this.log.debug('Using cached router rules')
      return this.cache
    }

    if (this.inFlight) {
      this.log.debug('Waiting for in-flight router rules fetch')
      return this.inFlight
    }

    this.log.debug('Fetching router rules from database')
    const generation = this.generation
    const fetchPromise = this.fetch()
    this.inFlight = fetchPromise

    try {
      const rules = await fetchPromise
      if (generation === this.generation) {
        this.cache = rules
      }
      return rules
    } finally {
      if (this.inFlight === fetchPromise) {
        this.inFlight = null
      }
    }
  }

  clear(): void {
    this.generation++
    this.cache = null
    this.inFlight = null
    this.log.debug('Router rules cache cleared')
  }
}
