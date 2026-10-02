import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
import { z } from 'zod'

// Extract Discord webhook field from backend API schema (includes URL validation)
const ApiWebhookSchema = ConfigUpdateSchema.pick({
  discordWebhookUrl: true,
})

export const webhookFormSchema = ApiWebhookSchema.extend({
  // Form-specific field for tracking connection test state
  _connectionTested: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (data.discordWebhookUrl && !data._connectionTested) {
    ctx.addIssue({
      code: 'custom',
      message: 'Please test connection before saving',
      path: ['discordWebhookUrl'],
    })
  }
})

export type WebhookFormSchema = z.infer<typeof webhookFormSchema>
