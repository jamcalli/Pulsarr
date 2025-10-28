import type { FastifyBaseLogger } from 'fastify'

/**
 * Service interface for fetching tags from Sonarr/Radarr
 */
export interface TagService {
  getTags: () => Promise<Array<{ id: number; label: string }>>
}

/**
 * Cache for storing tags by instance to avoid repeated API calls
 * Key format: "{instanceType}-{instanceId}" to avoid collisions
 */
export class TagCache {
  private cache: Map<string, Map<number, string>> = new Map()
  private regexCache: { pattern: string; compiled: RegExp } | null = null

  /**
   * Get tags for a specific instance, using cache if available
   *
   * @param instanceId - The ID of the Sonarr/Radarr instance
   * @param service - The service object with getTags method
   * @param instanceType - Type of instance ('sonarr' or 'radarr')
   * @param logger - Logger instance for error reporting
   * @returns Map of tag IDs to normalized tag labels
   */
  async getTagsForInstance(
    instanceId: number,
    service: TagService,
    instanceType: 'sonarr' | 'radarr',
    logger: FastifyBaseLogger,
  ): Promise<Map<number, string>> {
    // Create unique cache key with instance type and ID
    const cacheKey = `${instanceType}-${instanceId}`

    // Check if we have cached tags for this instance
    const cachedTags = this.cache.get(cacheKey)
    if (cachedTags) {
      return cachedTags
    }

    try {
      // Fetch tags from the service
      const allTags = await service.getTags()

      // Create a map of tag IDs to normalized tag labels (trimmed and lowercase)
      const tagMap = new Map(
        allTags.map((tag) => [tag.id, tag.label.trim().toLowerCase()]),
      )

      // Cache the result with unique key
      this.cache.set(cacheKey, tagMap)

      return tagMap
    } catch (error) {
      logger.error(
        { error },
        `Critical error fetching tags for ${instanceType} instance ${instanceId} - this may affect deletion accuracy`,
      )
      // Return empty map to prevent deletions when tag data is unavailable
      return new Map()
    }
  }

  /**
   * Get compiled regex for tag matching, using cache to avoid recompilation
   *
   * @param pattern - The regex pattern string
   * @returns Compiled RegExp object
   */
  getCompiledRegex(pattern: string): RegExp {
    // Use cached compiled regex or compile if pattern changed
    if (!this.regexCache || this.regexCache.pattern !== pattern) {
      this.regexCache = {
        pattern,
        compiled: new RegExp(pattern),
      }
    }
    return this.regexCache.compiled
  }

  /**
   * Clear the tag cache and regex cache (should be called at the start of each sync run)
   */
  clear(): void {
    this.cache.clear()
    this.regexCache = null
  }
}
