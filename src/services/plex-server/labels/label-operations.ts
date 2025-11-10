/**
 * Label Operations Module
 *
 * Provides functions for managing Plex item labels via the Plex Media Server API.
 * All operations require a valid server URL and authentication token.
 */

import type {
  PlexMetadata,
  PlexMetadataResponse,
} from '@root/types/plex-server.types.js'
import type { FastifyBaseLogger } from 'fastify'

const PLEX_API_TIMEOUT = 30000 // 30 seconds

/**
 * Retrieves metadata for a specific Plex item by rating key
 *
 * @param ratingKey - The Plex rating key identifying the item
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to metadata object, or null if not found or on error
 */
export async function getMetadata(
  ratingKey: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<PlexMetadata | null> {
  try {
    if (!token) {
      log.warn('No Plex token provided for metadata retrieval')
      return null
    }

    const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)

    log.debug(`Fetching metadata for rating key: ${ratingKey}`)

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'Pulsarr',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to fetch metadata: ${response.status} ${response.statusText}`,
      )
    }

    const data = (await response.json()) as PlexMetadataResponse
    const metadata = data.MediaContainer.Metadata?.[0] || null

    if (!metadata) {
      log.warn(`No metadata found for rating key: ${ratingKey}`)
      return null
    }

    log.debug(`Retrieved metadata for: ${metadata.title}`)
    return metadata
  } catch (error) {
    log.error(
      { error },
      `Error fetching metadata for rating key "${ratingKey}":`,
    )
    return null
  }
}

/**
 * Retrieves the current labels assigned to a Plex item
 *
 * @param ratingKey - The Plex rating key identifying the item
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to array of label strings, or empty array if none found
 */
export async function getCurrentLabels(
  ratingKey: string,
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<string[]> {
  try {
    log.debug(`Fetching metadata for rating key ${ratingKey}`)
    const metadata = await getMetadata(ratingKey, serverUrl, token, log)

    if (!metadata) {
      log.warn(`No metadata found for rating key ${ratingKey}`)
      return []
    }

    if (!metadata.Label) {
      log.debug(
        {
          metadataKeys: Object.keys(metadata),
          hasLabel: !!metadata.Label,
        },
        `No Label field found in metadata for rating key ${ratingKey}`,
      )
      return []
    }

    const labels = metadata.Label.map((label) => label.tag).filter(
      (tag): tag is string => typeof tag === 'string' && tag.length > 0,
    )
    log.debug(
      {
        labels,
        labelObjects: metadata.Label,
      },
      `Successfully retrieved ${labels.length} labels for rating key ${ratingKey}`,
    )
    return labels
  } catch (error) {
    log.error(
      { error },
      `Error getting current labels for rating key "${ratingKey}":`,
    )
    return []
  }
}

/**
 * Updates the labels for a Plex item, replacing all existing labels
 *
 * Supports clearing all labels by passing an empty array. The label field
 * is locked after update to prevent Plex from modifying it during metadata refreshes.
 *
 * @param ratingKey - The Plex rating key identifying the item
 * @param labels - Array of label strings to set (empty array clears all labels)
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function updateLabels(
  ratingKey: string,
  labels: string[],
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<boolean> {
  try {
    if (!token) {
      log.warn('No Plex token provided for label update')
      return false
    }

    const url = new URL(`/library/metadata/${ratingKey}`, serverUrl)

    // Handle empty labels array — clear all labels
    // Use the proper Plex API syntax for array-clears
    if (labels.length === 0) {
      // Use the - operator to clear all labels from the array field.
      // Format: label[].tag.tag- with an empty value (URLSearchParams encodes as label%5B%5D.tag.tag-=)
      url.searchParams.append('label[].tag.tag-', '')
      // Lock the labels field to prevent Plex from modifying during metadata refreshes
      url.searchParams.append('label.locked', '1')
      log.debug(
        `Clearing all labels for rating key ${ratingKey} using - operator with lock`,
      )
    } else {
      // Add each label as a separate parameter — this is the format Plex expects.
      // Sanitize and de-duplicate to avoid sending blanks/duplicates to Plex.
      const sanitized = [
        ...new Set(labels.map((l) => l.trim()).filter((l) => l.length > 0)),
      ]
      for (const label of sanitized) {
        url.searchParams.append('label[].tag.tag', label)
      }
      // Lock the labels field to prevent Plex from modifying during metadata refreshes
      url.searchParams.append('label.locked', '1')

      log.debug(
        `Updating labels for rating key ${ratingKey}: [${sanitized.join(', ')}] with lock`,
      )
    }

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'X-Plex-Token': token,
        'X-Plex-Client-Identifier': 'Pulsarr',
      },
      signal: AbortSignal.timeout(PLEX_API_TIMEOUT),
    })

    if (!response.ok) {
      throw new Error(
        `Failed to update labels: ${response.status} ${response.statusText}`,
      )
    }

    if (labels.length === 0) {
      log.debug(`Successfully removed all labels from rating key ${ratingKey}`)
    } else {
      log.debug(`Successfully updated labels for rating key ${ratingKey}`)
    }
    return true
  } catch (error) {
    log.error({ error }, `Error updating labels for rating key "${ratingKey}":`)
    return false
  }
}

/**
 * Removes specific labels from a Plex item while preserving others
 *
 * Performs case-insensitive label matching when determining which labels to remove.
 * If removing labels would result in an empty label set, all labels are cleared.
 *
 * @param ratingKey - The Plex rating key identifying the item
 * @param labelsToRemove - Array of label strings to remove from the item
 * @param serverUrl - The Plex server base URL
 * @param token - Authentication token for API access
 * @param log - Logger instance for operation tracking
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function removeSpecificLabels(
  ratingKey: string,
  labelsToRemove: string[],
  serverUrl: string,
  token: string,
  log: FastifyBaseLogger,
): Promise<boolean> {
  try {
    log.debug(
      {
        labelsToRemove,
        labelCount: labelsToRemove.length,
      },
      `Starting removeSpecificLabels for rating key ${ratingKey}`,
    )

    if (labelsToRemove.length === 0) {
      log.debug(`No labels to remove for rating key ${ratingKey}`)
      return true
    }

    // Get current labels
    log.debug(`Fetching current labels for rating key ${ratingKey}`)
    const currentLabels = await getCurrentLabels(
      ratingKey,
      serverUrl,
      token,
      log,
    )

    log.debug(
      {
        currentLabels,
        currentLabelCount: currentLabels.length,
      },
      `Current labels retrieved for rating key ${ratingKey}`,
    )

    if (currentLabels.length === 0) {
      log.warn(
        {
          labelsToRemove,
          ratingKey,
        },
        `No current labels found for rating key ${ratingKey}, cannot remove labels that don't exist. This may indicate a metadata API issue or the labels have already been removed.`,
      )
      return true
    }

    // Filter out labels to remove (case-insensitive comparison)
    const labelsToRemoveLower = labelsToRemove.map((label) =>
      label.toLowerCase(),
    )
    const filteredLabels = currentLabels.filter(
      (label) => !labelsToRemoveLower.includes(label.toLowerCase()),
    )

    log.debug(
      {
        currentLabels,
        labelsToRemove,
        filteredLabels,
      },
      `Removing labels from rating key ${ratingKey}: ${currentLabels.length} -> ${filteredLabels.length}`,
    )

    // Update with filtered labels (or empty array if all removed)
    if (filteredLabels.length === 0) {
      log.debug(
        `All labels will be removed from rating key ${ratingKey}. Delegating to updateLabels([]).`,
      )
    }

    return updateLabels(ratingKey, filteredLabels, serverUrl, token, log)
  } catch (error) {
    log.error(
      { error },
      `Error removing specific labels from rating key "${ratingKey}":`,
    )
    return false
  }
}
