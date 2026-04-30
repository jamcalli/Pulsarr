/**
 * System / Update Status Schema
 *
 * Response model for the cached "is a Pulsarr update available" check served
 * by `/v1/system/update-status`. Source of truth for both the route handler
 * and the client hook (typed via `z.infer`).
 */

import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const UpdateStatusEnum = z.enum([
  'ok',
  'pending',
  'rate_limited',
  'error',
])

export const UpdateStatusResponseSchema = z.object({
  /** Cleaned current Pulsarr version (e.g. "1.42.0"). */
  currentVersion: z.string(),
  /** Cleaned latest version, or null when GitHub has not been reached yet. */
  latestVersion: z.string().nullable(),
  /** True only when both versions are valid semver and latest > current. */
  updateAvailable: z.boolean(),
  /** GitHub release URL when known. */
  releaseUrl: z.string().nullable(),
  /** Display name from the release (often equal to tag), null when unknown. */
  releaseName: z.string().nullable(),
  /** Markdown release notes from GitHub, null when unknown. */
  releaseBody: z.string().nullable(),
  /** ISO timestamp when the release was published, null when unknown. */
  publishedAt: z.string().nullable(),
  /** ISO timestamp of the most recent refresh attempt; null on cold start. */
  lastCheckedAt: z.string().nullable(),
  /** Short message describing the last failure; null on success. */
  lastError: z.string().nullable(),
  /** Coarse-grained status ('ok' | 'pending' | 'rate_limited' | 'error'). */
  status: UpdateStatusEnum,
})

export type UpdateStatusResponse = z.infer<typeof UpdateStatusResponseSchema>

// Re-export shared ErrorSchema so the route's 500 response matches the
// Fastify Sensible HttpError shape ({ statusCode, code, error, message })
// returned by reply.internalServerError(...).
export { ErrorSchema as UpdateStatusErrorSchema }
export type UpdateStatusError = z.infer<typeof ErrorSchema>
