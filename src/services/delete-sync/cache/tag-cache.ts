import type { ArrCacheReadOptions } from '@services/arr/arr-caches.js'
import type { FastifyBaseLogger } from 'fastify'

export interface TagService {
  getTags: (
    options: ArrCacheReadOptions,
  ) => Promise<Array<{ id: number; label: string }>>
}

/** Tags per instance for one sync run, so callers clear() it before each run. */
export class TagCache {
  private cache: Map<string, Map<number, string>> = new Map()
  private regexCache: { pattern: string; compiled: RegExp } | null = null

  /** Labels come back trimmed and lowercased, and a failed fetch throws without being cached. */
  async getTagsForInstance(
    instanceId: number,
    service: TagService,
    instanceType: 'sonarr' | 'radarr',
    logger: FastifyBaseLogger,
  ): Promise<Map<number, string>> {
    const cacheKey = `${instanceType}-${instanceId}`

    const cachedTags = this.cache.get(cacheKey)
    if (cachedTags) {
      return cachedTags
    }

    try {
      const allTags = await service.getTags({ fresh: true })

      const tagMap = new Map(
        allTags.map((tag) => [tag.id, tag.label.trim().toLowerCase()]),
      )

      this.cache.set(cacheKey, tagMap)

      return tagMap
    } catch (error) {
      logger.error(
        { error },
        `Critical error fetching tags for ${instanceType} instance ${instanceId} - this may affect deletion accuracy`,
      )
      throw error
    }
  }

  getCompiledRegex(pattern: string): RegExp {
    if (!this.regexCache || this.regexCache.pattern !== pattern) {
      this.regexCache = {
        pattern,
        compiled: new RegExp(pattern, 'iu'),
      }
    }
    return this.regexCache.compiled
  }

  clear(): void {
    this.cache.clear()
    this.regexCache = null
  }
}
