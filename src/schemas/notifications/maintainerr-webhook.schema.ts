import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { z } from 'zod'

// Flattened Maintainerr webhook agent payload; mediaItems arrives as a
// JSON-encoded string, unknown template keys are stripped
export const MaintainerrWebhookPayloadSchema = z.object({
  notification_type: z.string().optional(),
  mediaItems: z.string().optional(),
})

export const MaintainerrWebhookResponseSchema = z.object({
  success: z.boolean(),
  created: z.number(),
})

export const MaintainerrReconcileStatusSchema = z
  .enum(['disabled', 'unsupported_version', 'error', 'ok'])
  .meta({
    id: 'MaintainerrReconcileStatus',
    description:
      'Outcome of the last Maintainerr reconcile. unsupported_version means Maintainerr is below the minimum version',
  })

export const MaintainerrStatusSchema = z
  .object({
    status: MaintainerrReconcileStatusSchema,
    version: z.string().optional(),
    configId: z.number().optional(),
    connectedGroups: z.number().optional(),
    testDelivered: z.boolean().optional(),
    error: z.string().optional(),
  })
  .meta({
    id: 'MaintainerrStatus',
    description: 'Result of the most recent Maintainerr reconcile',
  })

export const MaintainerrStatusResponseSchema = z.object({
  success: z.boolean(),
  result: MaintainerrStatusSchema.nullable(),
})

export type MaintainerrWebhookPayload = z.infer<
  typeof MaintainerrWebhookPayloadSchema
>
export type MaintainerrWebhookResponse = z.infer<
  typeof MaintainerrWebhookResponseSchema
>

export { ErrorSchema as MaintainerrWebhookErrorSchema }
