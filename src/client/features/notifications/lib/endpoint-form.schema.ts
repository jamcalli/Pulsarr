import { CreateWebhookEndpointSchema } from '@root/schemas/webhooks/webhook-endpoints.schema'
import { z } from 'zod'

const fields = CreateWebhookEndpointSchema.shape

export const NO_EVENTS_MESSAGE = 'Pick at least one event.'

interface HeaderValues {
  authHeaderName: string
  authHeaderValue: string
}

/** A header needs both a name and a value, '' in both means no header. */
export function headerError(
  values: HeaderValues,
): { path: keyof HeaderValues; message: string } | null {
  const hasName = values.authHeaderName.trim() !== ''
  const hasValue = values.authHeaderValue.trim() !== ''
  if (hasValue && !hasName) {
    return { path: 'authHeaderName', message: 'Add a header name.' }
  }
  if (hasName && !hasValue) {
    return { path: 'authHeaderValue', message: 'Add a header value.' }
  }
  return null
}

export const EndpointFormSchema = z
  .object({
    name: fields.name,
    url: fields.url,
    authHeaderName: fields.authHeaderName.unwrap(),
    authHeaderValue: fields.authHeaderValue.unwrap(),
    enabled: z.boolean(),
    eventTypes: z
      .array(fields.eventTypes.element)
      .min(1, { error: NO_EVENTS_MESSAGE }),
  })
  .superRefine((values, ctx) => {
    const error = headerError(values)
    if (error) {
      ctx.addIssue({
        code: 'custom',
        path: [error.path],
        message: error.message,
      })
    }
  })
