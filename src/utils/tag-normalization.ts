/**
 * Tag Normalization Utilities
 *
 * Provides consistent tag label normalization for Radarr v6/Sonarr compatibility.
 * Radarr v6 requires tags match the pattern: ^[a-z0-9-]+$
 */

/**
 * Normalizes a tag label to Radarr v6 compatible format
 *
 * Transformation rules:
 * 1. Convert to lowercase
 * 2. Replace invalid characters (anything not a-z, 0-9, or -) with hyphens
 * 3. Collapse multiple consecutive hyphens to single hyphen
 * 4. Trim leading and trailing hyphens
 *
 * @param label - The tag label to normalize
 * @returns Normalized tag label compatible with Radarr v6 validation (^[a-z0-9-]+$)
 *
 * @example
 * normalizeTagLabel("Pulsarr:User:John") // "pulsarr-user-john"
 * normalizeTagLabel("My.Tag_Name") // "my-tag-name"
 * normalizeTagLabel("--test--") // "test"
 */
export function normalizeTagLabel(label: string): string {
  return label
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
}
