import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

export const WebhookResyncInstanceResultSchema = z.object({
  instanceId: z.number(),
  name: z.string(),
  success: z.boolean(),
  message: z.string(),
})

export const WebhookResyncResponseSchema = z.object({
  success: z.boolean(),
  radarr: z.array(WebhookResyncInstanceResultSchema),
  sonarr: z.array(WebhookResyncInstanceResultSchema),
})

export type WebhookResyncInstanceResult = z.infer<
  typeof WebhookResyncInstanceResultSchema
>
export type WebhookResyncResponse = z.infer<typeof WebhookResyncResponseSchema>

export { ErrorSchema }
