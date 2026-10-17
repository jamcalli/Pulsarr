import {
  WEBHOOK_PAYLOAD_SCHEMAS,
  type WebhookPayloadMap,
} from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type { NotificationTestResult } from '@root/types/notification.types.js'
import type {
  WebhookDispatchResult,
  WebhookEndpoint,
  WebhookEventType,
  WebhookPayloadEnvelope,
} from '@root/types/webhook-endpoint.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { type PostJsonResult, postJson } from './http.js'
import { timeTest } from './time-test.js'

export interface NativeWebhookDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

const NATIVE_WEBHOOK_TIMEOUT_MS = 10_000

function nativeFailureReason(response: Response): string {
  return `HTTP ${response.status}: ${response.statusText}`
}

function postToEndpoint(
  url: string,
  payload: WebhookPayloadEnvelope,
  authHeaderName: string | null | undefined,
  authHeaderValue: string | null | undefined,
  retry: boolean,
): Promise<PostJsonResult> {
  return postJson(url, payload, {
    timeoutMs: NATIVE_WEBHOOK_TIMEOUT_MS,
    retry,
    headers: {
      'User-Agent': USER_AGENT,
      ...(authHeaderName && authHeaderValue
        ? { [authHeaderName]: authHeaderValue }
        : {}),
    },
    failureReason: nativeFailureReason,
  })
}

async function sendToEndpoint(
  endpoint: WebhookEndpoint,
  payload: WebhookPayloadEnvelope,
): Promise<{ success: boolean; error?: string }> {
  const result = await postToEndpoint(
    endpoint.url,
    payload,
    endpoint.auth_header_name,
    endpoint.auth_header_value,
    true,
  )
  return result.ok
    ? { success: true }
    : { success: false, error: result.reason }
}

export async function dispatchWebhooks<T extends WebhookEventType>(
  eventType: T,
  data: WebhookPayloadMap[T],
  deps: NativeWebhookDeps,
): Promise<WebhookDispatchResult> {
  let endpoints: WebhookEndpoint[]
  try {
    endpoints = await deps.db.getWebhookEndpointsForEvent(eventType)
  } catch (error) {
    deps.logger.error({ error, eventType }, 'Failed to load webhook endpoints')
    return { dispatched: 0, succeeded: 0, failed: 0, results: [] }
  }

  if (endpoints.length === 0) {
    return { dispatched: 0, succeeded: 0, failed: 0, results: [] }
  }

  const schema = WEBHOOK_PAYLOAD_SCHEMAS[eventType]
  const parseResult = schema.safeParse(data)
  if (!parseResult.success) {
    deps.logger.error(
      { eventType, error: parseResult.error.message },
      'Webhook payload failed validation, which means the calling code has a bug',
    )
    return { dispatched: 0, succeeded: 0, failed: 0, results: [] }
  }
  const validatedData = parseResult.data

  const payload: WebhookPayloadEnvelope<WebhookPayloadMap[T]> = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: validatedData,
  }

  const limit = pLimit(5)
  const results = await Promise.allSettled(
    endpoints.map((endpoint) => limit(() => sendToEndpoint(endpoint, payload))),
  )

  const endpointResults = results.map((result, index) => {
    const endpoint = endpoints[index]
    if (result.status === 'fulfilled') {
      return {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        success: result.value.success,
        error: result.value.error,
      }
    }
    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      success: false,
      error: String(result.reason),
    }
  })

  const succeeded = endpointResults.filter((r) => r.success).length
  const failed = endpointResults.length - succeeded

  deps.logger.debug(
    { eventType, total: endpoints.length, succeeded, failed },
    'Webhooks dispatched',
  )

  return {
    dispatched: endpoints.length,
    succeeded,
    failed,
    results: endpointResults,
  }
}

export async function testWebhookEndpoint(
  url: string,
  authHeaderName?: string,
  authHeaderValue?: string,
  endpointName?: string,
  log?: FastifyBaseLogger,
): Promise<NotificationTestResult> {
  const testPayload: WebhookPayloadEnvelope<{
    message: string
    endpointName: string
  }> = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'Test webhook from Pulsarr',
      endpointName: endpointName || 'Unknown',
    },
  }

  return timeTest(async () => {
    const result = await postToEndpoint(
      url,
      testPayload,
      authHeaderName,
      authHeaderValue,
      false,
    )
    if (result.ok) return { success: true, statusCode: result.status }
    if (result.status !== undefined) {
      return { success: false, statusCode: result.status, error: result.reason }
    }
    if (result.reason.includes('abort') || result.reason.includes('timeout')) {
      return { success: false, error: 'Request timed out after 10 seconds' }
    }
    log?.warn({ endpointName, error: result.reason }, 'Webhook test failed')
    return { success: false, error: result.reason }
  })
}
