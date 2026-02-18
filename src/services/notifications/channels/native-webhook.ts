/**
 * Native Webhook Channel
 *
 * Dispatches notifications to user-configured webhook endpoints.
 * Supports custom authentication headers and multiple event types.
 *
 * Uses typed dispatch with Zod validation to ensure payload correctness:
 * - Compile-time: TypeScript enforces correct payload shape per event type
 * - Runtime: Zod validates payload before dispatch (safety net)
 */

import {
  WEBHOOK_PAYLOAD_SCHEMAS,
  type WebhookPayloadMap,
} from '@root/schemas/webhooks/webhook-payloads.schema.js'
import type {
  TestWebhookResult,
  WebhookDispatchResult,
  WebhookEndpoint,
  WebhookEventType,
  WebhookPayloadEnvelope,
} from '@root/types/webhook-endpoint.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { USER_AGENT } from '@utils/version.js'
import type { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'

export interface NativeWebhookDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

/**
 * Sends a payload to a single webhook endpoint.
 */
async function sendToEndpoint(
  endpoint: WebhookEndpoint,
  payload: WebhookPayloadEnvelope,
  log: FastifyBaseLogger,
): Promise<{ success: boolean; error?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  }

  if (endpoint.auth_header_name && endpoint.auth_header_value) {
    headers[endpoint.auth_header_name] = endpoint.auth_header_value
  }

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`
      log.warn(
        { endpointId: endpoint.id, endpointName: endpoint.name, error },
        'Webhook request failed',
      )
      return { success: false, error }
    }

    log.debug(
      {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        event: payload.event,
      },
      'Webhook delivered',
    )
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error(
      { endpointId: endpoint.id, endpointName: endpoint.name, error },
      'Webhook request error',
    )
    return { success: false, error }
  }
}

/**
 * Dispatches a webhook event to all enabled endpoints subscribed to that event type.
 *
 * Uses typed generic constraint to enforce correct payload shape per event type
 * at compile time. Also performs runtime validation as a safety net.
 *
 * @param eventType - The type of event being dispatched
 * @param data - The event payload data (must match WebhookPayloadMap[eventType])
 * @param deps - Dependencies (database, logger)
 * @returns Result containing dispatch statistics and per-endpoint results
 */
export async function dispatchWebhooks<T extends WebhookEventType>(
  eventType: T,
  data: WebhookPayloadMap[T],
  deps: NativeWebhookDeps,
): Promise<WebhookDispatchResult> {
  const endpoints = await deps.db.getWebhookEndpointsForEvent(eventType)

  if (endpoints.length === 0) {
    return { dispatched: 0, succeeded: 0, failed: 0, results: [] }
  }

  // Runtime validation as safety net (compile-time types should catch most issues)
  const schema = WEBHOOK_PAYLOAD_SCHEMAS[eventType]
  const parseResult = schema.safeParse(data)
  if (!parseResult.success) {
    deps.log.error(
      { eventType, error: parseResult.error.message },
      'Webhook payload validation failed - this indicates a bug in the calling code',
    )
    return { dispatched: 0, succeeded: 0, failed: 0, results: [] }
  }
  const validatedData = parseResult.data

  const payload: WebhookPayloadEnvelope<WebhookPayloadMap[T]> = {
    event: eventType,
    timestamp: new Date().toISOString(),
    data: validatedData,
  }

  // Limit concurrent webhook requests to prevent resource exhaustion
  const limit = pLimit(5)
  const results = await Promise.allSettled(
    endpoints.map((endpoint) =>
      limit(() => sendToEndpoint(endpoint, payload, deps.log)),
    ),
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

  if (failed > 0) {
    deps.log.warn(
      { eventType, total: endpoints.length, succeeded, failed },
      'Some webhook dispatches failed',
    )
  } else if (succeeded > 0) {
    deps.log.info(
      { eventType, count: succeeded },
      'Webhooks dispatched successfully',
    )
  }

  return {
    dispatched: endpoints.length,
    succeeded,
    failed,
    results: endpointResults,
  }
}

/**
 * Checks if there are any enabled webhook endpoints configured for an event type.
 * Use this to determine whether to set sent_to_native_webhook flag on notification records.
 */
export async function hasWebhooksForEvent(
  eventType: WebhookEventType,
  deps: NativeWebhookDeps,
): Promise<boolean> {
  const endpoints = await deps.db.getWebhookEndpointsForEvent(eventType)
  return endpoints.length > 0
}

/**
 * Tests a webhook endpoint by sending a test payload.
 *
 * @param url - The webhook URL to test
 * @param authHeaderName - Optional authentication header name
 * @param authHeaderValue - Optional authentication header value
 * @param endpointName - Optional endpoint name for the test payload
 * @param log - Optional logger for error reporting
 * @returns Test result with success status, response time, and any errors
 */
export async function testWebhookEndpoint(
  url: string,
  authHeaderName?: string,
  authHeaderValue?: string,
  endpointName?: string,
  log?: FastifyBaseLogger,
): Promise<TestWebhookResult> {
  const startTime = Date.now()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': USER_AGENT,
  }

  if (authHeaderName && authHeaderValue) {
    headers[authHeaderName] = authHeaderValue
  }

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

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(10000),
    })

    const responseTime = Date.now() - startTime

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    return { success: true, statusCode: response.status, responseTime }
  } catch (err) {
    const responseTime = Date.now() - startTime
    const error = err instanceof Error ? err.message : String(err)

    if (error.includes('abort') || error.includes('timeout')) {
      return {
        success: false,
        responseTime,
        error: 'Request timed out after 10 seconds',
      }
    }

    log?.warn({ url, error }, 'Webhook test failed')
    return { success: false, responseTime, error }
  }
}
