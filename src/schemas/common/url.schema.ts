import { z } from 'zod'

/**
 * Validates a URL restricted to http/https schemes.
 * Used for services that require HTTP connections (Sonarr, Radarr, webhooks, etc.).
 * Restricts to http/https to mitigate SSRF risk from exotic URL schemes.
 */
export const HttpUrlSchema = z.string().refine(
  (s) => {
    try {
      const url = new URL(s)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  },
  { message: 'Must be a valid http(s) URL' },
)

/**
 * Optional version of HttpUrlSchema that accepts empty strings.
 * Used for optional URL fields in configuration.
 */
export const HttpUrlOptionalSchema = z
  .union([HttpUrlSchema, z.literal('')])
  .optional()
