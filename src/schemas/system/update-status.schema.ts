import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const UpdateStatusEnum = z.enum([
  'ok',
  'pending',
  'rate_limited',
  'error',
])

export const UpdateStatusResponseSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseUrl: z.string().nullable(),
  releaseName: z.string().nullable(),
  releaseBody: z.string().nullable(),
  releaseBodyHtml: z.string().nullable(),
  publishedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  status: UpdateStatusEnum,
})

export type UpdateStatusResponse = z.infer<typeof UpdateStatusResponseSchema>

export { ErrorSchema as UpdateStatusErrorSchema }
export type UpdateStatusError = z.infer<typeof ErrorSchema>
