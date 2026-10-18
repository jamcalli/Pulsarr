import {
  headerError,
  NO_EVENTS_MESSAGE,
} from '@/features/notifications/lib/endpoint-form.schema'
import { sortEventTypes } from '@/features/notifications/lib/webhooks'
import type { components } from '@/types/api.js'

type WebhookEndpoint = components['schemas']['WebhookEndpoint']
type CreatePayload = components['schemas']['WebhookEndpointCreatePayload']
type UpdatePayload = components['schemas']['WebhookEndpointUpdatePayload']

export interface EndpointFormValues {
  name: string
  url: string
  authHeaderName: string
  authHeaderValue: string
  enabled: boolean
  eventTypes: components['schemas']['WebhookEventType'][]
}

export function endpointFormValues(
  endpoint: WebhookEndpoint | null,
): EndpointFormValues {
  return {
    name: endpoint?.name ?? '',
    url: endpoint?.url ?? '',
    authHeaderName: endpoint?.authHeaderName ?? '',
    authHeaderValue: endpoint?.authHeaderValue ?? '',
    enabled: endpoint?.enabled ?? true,
    eventTypes: sortEventTypes(endpoint?.eventTypes ?? []),
  }
}

/** The sentence the save bar shows while save stays disabled, or null. */
export function endpointSaveError(values: EndpointFormValues): string | null {
  if (values.eventTypes.length === 0) return NO_EVENTS_MESSAGE
  return headerError(values)?.message ?? null
}

function hasHeader(values: EndpointFormValues): boolean {
  return values.authHeaderName.trim() !== ''
}

export function createPayload(values: EndpointFormValues): CreatePayload {
  return {
    name: values.name,
    url: values.url,
    eventTypes: values.eventTypes,
    enabled: values.enabled,
    ...(hasHeader(values) && {
      authHeaderName: values.authHeaderName,
      authHeaderValue: values.authHeaderValue,
    }),
  }
}

/** Only the fields that differ from the saved endpoint, with null clearing the header. */
export function updatePayload(
  saved: WebhookEndpoint,
  values: EndpointFormValues,
): UpdatePayload {
  const before = endpointFormValues(saved)
  const header = hasHeader(values)
  const headerChanged =
    values.authHeaderName !== before.authHeaderName ||
    values.authHeaderValue !== before.authHeaderValue
  const eventsChanged = values.eventTypes.join() !== before.eventTypes.join()

  return {
    ...(values.name !== before.name && { name: values.name }),
    ...(values.url !== before.url && { url: values.url }),
    ...(values.enabled !== before.enabled && { enabled: values.enabled }),
    ...(eventsChanged && { eventTypes: values.eventTypes }),
    ...(headerChanged && {
      authHeaderName: header ? values.authHeaderName : null,
      authHeaderValue: header ? values.authHeaderValue : null,
    }),
  }
}

/** The unsaved test body, which leaves the header out unless both parts are set. */
export function testPayload(
  values: Pick<
    EndpointFormValues,
    'url' | 'authHeaderName' | 'authHeaderValue'
  >,
): components['schemas']['WebhookEndpointTestPayload'] {
  const header =
    values.authHeaderName.trim() !== '' && values.authHeaderValue.trim() !== ''
  return {
    url: values.url.trim(),
    ...(header && {
      authHeaderName: values.authHeaderName,
      authHeaderValue: values.authHeaderValue,
    }),
  }
}
