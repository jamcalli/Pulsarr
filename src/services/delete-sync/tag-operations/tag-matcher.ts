import type { TagCache, TagService } from '@services/delete-sync/cache/index.js'
import type { FastifyBaseLogger } from 'fastify'

/**
 * Gets the normalized removal tag prefix (trimmed and lowercased)
 * @param removedTagPrefix - The raw removal tag prefix from config
 * @returns The normalized removal tag prefix, or empty string if not configured
 */
export function getRemovalTagPrefixNormalized(
  removedTagPrefix: string | undefined,
): string {
  return (removedTagPrefix ?? '').trim().toLowerCase()
}

/**
 * Check if an item has the configured removal tag
 *
 * @param instanceId - The instance ID
 * @param service - The media service (Sonarr or Radarr)
 * @param itemTags - The tag IDs on the media item
 * @param instanceType - Type of instance ('sonarr' or 'radarr') for proper cache keying
 * @param removedTagPrefix - The removal tag prefix from config
 * @param tagCache - The tag cache instance
 * @param logger - Logger instance for debug/error messages
 * @returns Promise resolving to true if the item has the removal tag
 */
export async function hasRemovalTag(
  instanceId: number,
  service: TagService,
  itemTags: number[],
  instanceType: 'sonarr' | 'radarr',
  removedTagPrefix: string | undefined,
  tagCache: TagCache,
  logger: FastifyBaseLogger,
): Promise<boolean> {
  if (itemTags.length === 0) {
    return false
  }

  try {
    // Safeguard against missing configuration
    const removalTagPrefixNormalized =
      getRemovalTagPrefixNormalized(removedTagPrefix)
    if (!removalTagPrefixNormalized) {
      logger.debug(
        'removedTagPrefix is blank – tag-based deletion will never match any items',
      )
      return false
    }

    // Get tags from cache or fetch them using the explicit instance type
    const tagMap = await tagCache.getTagsForInstance(
      instanceId,
      service,
      instanceType,
      logger,
    )

    // Check if any of the item's tags match our removal tag (using startsWith for prefix matching)
    for (const tagId of itemTags) {
      const tagLabel = tagMap.get(tagId)
      if (tagLabel?.startsWith(removalTagPrefixNormalized)) {
        return true
      }
    }

    return false
  } catch (error) {
    logger.error({ error }, 'Error checking for removal tag:')
    return false
  }
}

/**
 * Check if media item has a tag matching the configured regex pattern.
 * Used as an additional filter for tag-based deletion - content must have BOTH
 * the removal tag AND a tag matching this regex to be deleted.
 *
 * @param instanceId - The ID of the Sonarr/Radarr instance
 * @param service - The service object with getTags method
 * @param itemTags - The tag IDs on the media item
 * @param instanceType - Type of instance ('sonarr' or 'radarr') for proper cache keying
 * @param regexPattern - The regex pattern from config (optional)
 * @param tagCache - The tag cache instance
 * @param logger - Logger instance for error messages
 * @returns Promise resolving to true if the item has a tag matching the regex
 */
export async function hasTagMatchingRegex(
  instanceId: number,
  service: TagService,
  itemTags: number[],
  instanceType: 'sonarr' | 'radarr',
  regexPattern: string | undefined,
  tagCache: TagCache,
  logger: FastifyBaseLogger,
): Promise<boolean> {
  // If no regex is configured, return true (don't filter)
  if (!regexPattern) {
    return true
  }

  if (itemTags.length === 0) {
    return false
  }

  try {
    // Get compiled regex from cache (reuses across all calls within a single run)
    const regex = tagCache.getCompiledRegex(regexPattern)

    // Get tags from cache or fetch them using the explicit instance type
    const tagMap = await tagCache.getTagsForInstance(
      instanceId,
      service,
      instanceType,
      logger,
    )

    // Check if any of the item's tags match the regex pattern
    for (const tagId of itemTags) {
      const tagLabel = tagMap.get(tagId)
      if (tagLabel && regex.test(tagLabel)) {
        return true
      }
    }

    return false
  } catch (error) {
    logger.error(
      { error, regexPattern },
      'Error checking for tag matching regex:',
    )
    return false
  }
}
