import { ErrorSchema } from '@root/schemas/common/error.schema.js'
import { WEBHOOK_EVENT_TYPES } from '@root/types/webhook-endpoint.types.js'
import { z } from 'zod'

// Event type schema derived from the constant array
export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES)

// Base webhook endpoint schema (database representation)
export const WebhookEndpointSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string().pipe(z.url()),
  authHeaderName: z.string().nullable(),
  authHeaderValue: z.string().nullable(),
  eventTypes: z.array(WebhookEventTypeSchema),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// Create webhook endpoint request schema
export const CreateWebhookEndpointSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(100, { error: 'Name must be at most 100 characters' }),
  url: z
    .string()
    .trim()
    .pipe(z.url({ error: 'Must be a valid URL' })),
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

// Update webhook endpoint request schema
export const UpdateWebhookEndpointSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(100, { error: 'Name must be at most 100 characters' })
    .optional(),
  url: z
    .string()
    .trim()
    .pipe(z.url({ error: 'Must be a valid URL' }))
    .optional(),
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

// Test webhook endpoint request schema
export const TestWebhookEndpointSchema = z.object({
  url: z
    .string()
    .trim()
    .pipe(z.url({ error: 'Must be a valid URL' })),
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

// Route params schema
export const WebhookEndpointParamsSchema = z.object({
  id: z.coerce.number(),
})

// Response schemas
export const WebhookEndpointResponseSchema = z.object({
  success: z.literal(true),
  data: WebhookEndpointSchema,
})

export const WebhookEndpointsListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(WebhookEndpointSchema),
})

export const WebhookTestResponseSchema = z.object({
  success: z.boolean(),
  statusCode: z.number().optional(),
  error: z.string().optional(),
  responseTime: z.number(), // milliseconds
})

export const WebhookDeleteResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

// Event types list for UI
export const WebhookEventTypesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      type: WebhookEventTypeSchema,
      description: z.string(),
    }),
  ),
})

// Inferred types
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
export type WebhookTestResponse = z.infer<typeof WebhookTestResponseSchema>
export type WebhookDeleteResponse = z.infer<typeof WebhookDeleteResponseSchema>
export type WebhookEventTypesResponse = z.infer<
  typeof WebhookEventTypesResponseSchema
>

// Re-export shared error schema with domain-specific alias
export { ErrorSchema as WebhookEndpointErrorSchema }
export type WebhookEndpointError = z.infer<typeof ErrorSchema>
