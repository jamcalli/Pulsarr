import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { HttpUrlSchema } from '@root/schemas/common/url.schema.js'
import { WEBHOOK_EVENT_TYPES } from '@root/types/webhook-endpoint.types.js'
import { z } from 'zod'

export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES).meta({
  id: 'WebhookEventType',
  description: 'A Pulsarr event a webhook endpoint can receive',
})

export const WebhookEndpointSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    url: HttpUrlSchema,
    authHeaderName: z.string().nullable(),
    authHeaderValue: z.string().nullable(),
    eventTypes: z.array(WebhookEventTypeSchema),
    enabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({
    id: 'WebhookEndpoint',
    description: 'A native webhook endpoint, auth header value included',
  })

export const CreateWebhookEndpointSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Name is required' })
      .max(100, { error: 'Name must be at most 100 characters' }),
    url: HttpUrlSchema,
    authHeaderName: z
      .string()
      .trim()
      .max(100, { error: 'Header name must be at most 100 characters' })
      .optional(),
    authHeaderValue: z
      .string()
      .max(500, { error: 'Header value must be at most 500 characters' })
      .optional(),
    eventTypes: z
      .array(WebhookEventTypeSchema)
      .min(1, { error: 'At least one event type is required' }),
    enabled: z.boolean().optional().default(true),
  })
  .meta({
    id: 'WebhookEndpointCreatePayload',
    description: 'A new native webhook endpoint',
  })

export const UpdateWebhookEndpointSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Name is required' })
      .max(100, { error: 'Name must be at most 100 characters' })
      .optional(),
    url: HttpUrlSchema.optional(),
    authHeaderName: z
      .string()
      .trim()
      .max(100, { error: 'Header name must be at most 100 characters' })
      .nullable()
      .optional(),
    authHeaderValue: z
      .string()
      .max(500, { error: 'Header value must be at most 500 characters' })
      .nullable()
      .optional(),
    eventTypes: z
      .array(WebhookEventTypeSchema)
      .min(1, { error: 'At least one event type is required' })
      .optional(),
    enabled: z.boolean().optional(),
  })
  .meta({
    id: 'WebhookEndpointUpdatePayload',
    description: 'Changes to a native webhook endpoint, null clears a header',
  })

export const TestWebhookEndpointSchema = z
  .object({
    url: HttpUrlSchema,
    authHeaderName: z
      .string()
      .trim()
      .max(100, { error: 'Header name must be at most 100 characters' })
      .optional(),
    authHeaderValue: z
      .string()
      .max(500, { error: 'Header value must be at most 500 characters' })
      .optional(),
  })
  .meta({
    id: 'WebhookEndpointTestPayload',
    description:
      'An unsaved webhook URL and auth header to send a test event to',
  })

export const WebhookEndpointParamsSchema = z.object({
  id: z.coerce.number(),
})

export const WebhookEndpointResponseSchema = z
  .object({
    success: z.literal(true),
    data: WebhookEndpointSchema,
  })
  .meta({
    id: 'WebhookEndpointResponse',
    description: 'One native webhook endpoint',
  })

export const WebhookEndpointsListResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(WebhookEndpointSchema),
  })
  .meta({
    id: 'WebhookEndpointList',
    description: 'Every native webhook endpoint',
  })

export const WebhookDeleteResponseSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
  })
  .meta({
    id: 'WebhookEndpointDeleteResponse',
    description: 'Result of deleting a native webhook endpoint',
  })

export const WebhookEventTypesResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(
      z.object({
        type: WebhookEventTypeSchema,
        description: z.string(),
      }),
    ),
  })
  .meta({
    id: 'WebhookEventTypeList',
    description: 'Every webhook event type with what triggers it',
  })

export type WebhookEventTypeValue = z.infer<typeof WebhookEventTypeSchema>
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>
export type CreateWebhookEndpoint = z.infer<typeof CreateWebhookEndpointSchema>
export type UpdateWebhookEndpoint = z.infer<typeof UpdateWebhookEndpointSchema>
export type TestWebhookEndpoint = z.infer<typeof TestWebhookEndpointSchema>
export type WebhookEndpointParams = z.infer<typeof WebhookEndpointParamsSchema>
export type WebhookEndpointResponse = z.infer<
  typeof WebhookEndpointResponseSchema
>
export type WebhookEndpointsListResponse = z.infer<
  typeof WebhookEndpointsListResponseSchema
>
export type WebhookDeleteResponse = z.infer<typeof WebhookDeleteResponseSchema>
export type WebhookEventTypesResponse = z.infer<
  typeof WebhookEventTypesResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as WebhookEndpointErrorSchema }
export type WebhookEndpointError = z.infer<typeof ErrorSchema>
