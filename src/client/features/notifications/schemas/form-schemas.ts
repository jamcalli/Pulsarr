import { ConfigSchema } from '@root/schemas/config/config.schema'
import { z } from 'zod'
import { discordWebhookStringSchema } from '@/utils/discord-webhook-validation'

// Extract Discord webhook field from backend API schema and extend with validation
const ApiWebhookSchema = ConfigSchema.pick({
  discordWebhookUrl: true,
})

export const webhookFormSchema = ApiWebhookSchema.extend({
  // Use shared Discord webhook validation
  discordWebhookUrl: discordWebhookStringSchema,
  // Form-specific field for tracking connection test state
  _connectionTested: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (data.discordWebhookUrl && !data._connectionTested) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please test connection before saving',
      path: ['discordWebhookUrl'],
    })
  }
})

export type WebhookFormSchema = z.infer<typeof webhookFormSchema>
