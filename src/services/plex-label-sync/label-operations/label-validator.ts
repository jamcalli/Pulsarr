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
 * @param tagPrefix - The configured tag prefix (default: 'pulsarr:user')
 * @param removedTagPrefix - The configured removed tag prefix (default: 'pulsarr:removed')
 * @returns True if this is a user tagging system tag or special removal tag
 */
export function isUserTaggingSystemTag(
  tagName: string,
  tagPrefix: string = 'pulsarr:user',
  removedTagPrefix: string = 'pulsarr:removed',
): boolean {
  return (
    tagName.toLowerCase().startsWith(`${tagPrefix.toLowerCase()}:`) ||
    tagName.toLowerCase().startsWith(removedTagPrefix.toLowerCase())
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
