/**
 * Label Validation Utilities
 *
 * Provides functions to validate and categorize Plex labels based on configured prefixes.
 * Helps determine if labels are managed by Pulsarr and what type of label they are.
 */

export interface LabelValidationConfig {
  /** Label prefix for app-managed labels (e.g., "pulsarr") */
  labelPrefix: string
  /** Label prefix for removed/deleted content markers */
  removedLabelPrefix: string
  /** Tag prefix for user tagging system */
  tagPrefix?: string
  /** Tag prefix for removed tags */
  removedTagPrefix?: string
}

/**
 * Checks if a label was created by this app based on the configured prefix
 *
 * @param labelName - The label to check
 * @param labelPrefix - The configured label prefix
 * @returns True if this is an app-managed user label
 */
export function isAppUserLabel(
  labelName: string,
  labelPrefix: string,
): boolean {
  return labelName.toLowerCase().startsWith(`${labelPrefix.toLowerCase()}:`)
}

/**
 * Checks if a label is a user-specific label (format: prefix:user:username)
 *
 * @param labelName - The label to check
 * @param labelPrefix - The configured label prefix
 * @returns True if this is a user-specific label
 */
export function isUserSpecificLabel(
  labelName: string,
  labelPrefix: string,
): boolean {
  const prefix = labelPrefix.toLowerCase()
  const lname = labelName.toLowerCase()
  // user labels are "prefix:user:username"
  return lname.startsWith(`${prefix}:user:`)
}

/**
 * Checks if a label is a tag label managed by this app (format: prefix:tagname)
 * Tag labels are app labels that are NOT user-specific labels
 *
 * @param labelName - The label to check
 * @param labelPrefix - The configured label prefix
 * @returns True if this is an app-managed tag label
 */
export function isAppTagLabel(labelName: string, labelPrefix: string): boolean {
  return (
    isAppUserLabel(labelName, labelPrefix) &&
    !isUserSpecificLabel(labelName, labelPrefix)
  )
}

/**
 * Checks if a label is managed by this service (app-prefixed labels + removed markers)
 *
 * @param label - The label to check
 * @param labelPrefix - The configured label prefix
 * @param removedLabelPrefix - The configured removed label prefix
 * @returns True if this is a Pulsarr-managed label
 */
export function isManagedLabel(
  label: string,
  labelPrefix: string,
  removedLabelPrefix: string,
): boolean {
  return (
    isAppUserLabel(label, labelPrefix) ||
    label.toLowerCase().startsWith(removedLabelPrefix.toLowerCase())
  )
}

/**
 * Checks if a tag is managed by the user tagging system or is a special removal tag
 *
 * @param tagName - The tag to check
 * @param tagPrefix - The configured tag prefix (default: 'pulsarr-user')
 * @param removedTagPrefix - The configured removed tag prefix (default: 'pulsarr-removed')
 * @returns True if this is a user tagging system tag or special removal tag
 */
export function isUserTaggingSystemTag(
  tagName: string,
  tagPrefix: string = 'pulsarr-user',
  removedTagPrefix: string = 'pulsarr-removed',
): boolean {
  const lowerTag = tagName.toLowerCase()
  const lowerPrefix = tagPrefix.toLowerCase()
  const lowerRemovedPrefix = removedTagPrefix.toLowerCase()

  return (
    // Check for user tagging system tags with hyphen delimiter
    lowerTag.startsWith(`${lowerPrefix}-`) ||
    // Check for removed tag prefix
    lowerTag.startsWith(lowerRemovedPrefix)
  )
}

/**
 * Gets the removed label string for tracking removed users
 *
 * @param removedLabelPrefix - The configured removed label prefix
 * @returns The removed label string
 */
export function getRemovedLabel(removedLabelPrefix: string): string {
  return removedLabelPrefix
}

/**
 * Filters out user tagging system tags and formats remaining tags as Plex labels
 *
 * This utility is used across the codebase to ensure tags from Radarr/Sonarr that
 * are managed by the user tagging system (e.g., 'pulsarr:user:username' tags) are
 * excluded from being synced as Plex labels.
 *
 * @param tags - Array of tag names to filter and format
 * @param tagPrefix - Prefix for user tagging system tags (e.g., 'pulsarr:user')
 * @param removedTagPrefix - Prefix for removed tags (e.g., 'pulsarr:removed')
 * @param labelPrefix - Prefix to use for formatted labels (e.g., 'pulsarr')
 * @returns Array of formatted labels (e.g., ['pulsarr:genre', 'pulsarr:quality']) excluding system tags
 *
 * @example
 * const tags = ['genre', 'pulsarr:user:john', 'quality', 'pulsarr:removed:old'];
 * const result = filterAndFormatTagsAsLabels(tags, 'pulsarr:user', 'pulsarr:removed', 'pulsarr');
 * // Returns: ['pulsarr:genre', 'pulsarr:quality']
 */
export function filterAndFormatTagsAsLabels(
  tags: string[],
  tagPrefix: string,
  removedTagPrefix: string,
  labelPrefix: string,
): string[] {
  return tags
    .filter((tag) => !isUserTaggingSystemTag(tag, tagPrefix, removedTagPrefix))
    .map((tag) => `${labelPrefix}:${tag}`)
}

/**
 * Checks if a label exists in an array (case-insensitive).
 * Plex auto-capitalizes the first letter of labels, so comparisons must be case-insensitive.
 *
 * @param labels - Array of labels to search
 * @param label - The label to find
 * @returns True if the label exists (case-insensitive match)
 */
export function includesLabelIgnoreCase(
  labels: string[],
  label: string,
): boolean {
  const lowerLabel = label.toLowerCase()
  return labels.some((l) => l.toLowerCase() === lowerLabel)
}

/**
 * Creates a case-insensitive unique array of labels, preserving the original casing of the first occurrence.
 * Used to deduplicate labels while handling Plex's auto-capitalization.
 *
 * @param labels - Array of labels to deduplicate
 * @returns Array of unique labels (case-insensitive)
 */
export function uniqueLabelsIgnoreCase(labels: string[]): string[] {
  const seen = new Map<string, string>()
  for (const label of labels) {
    const lower = label.toLowerCase()
    if (!seen.has(lower)) {
      seen.set(lower, label)
    }
  }
  return Array.from(seen.values())
}
