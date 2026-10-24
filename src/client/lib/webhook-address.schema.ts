import { HttpUrlSchema } from '@root/schemas/common/url.schema'
import { ConfigUpdateSchema } from '@root/schemas/config/config.schema'
import { z } from 'zod'
import { WEBHOOK_PRESET_VALUES } from '@/lib/webhook-address'

/** The address field drops the config's empty-string option, since the arrs need a real address. */
export const WebhookAddressSchema = z.object({
  preset: z.enum(WEBHOOK_PRESET_VALUES),
  baseUrl: HttpUrlSchema,
  port: ConfigUpdateSchema.shape.port.unwrap(),
})
