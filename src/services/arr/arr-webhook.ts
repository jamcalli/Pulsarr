import {
  HttpError,
  WebhookCallbackError,
} from '@root/types/arr-connection.types.js'
import type { ArrProduct } from '@services/arr/arr-product.js'
import { isWebhookCallbackFailure } from '@utils/arr-error.js'
import { errorMessage } from '@utils/error-message.js'
import { normalizeBasePath } from '@utils/url.js'
import type { FastifyBaseLogger } from 'fastify'

export interface PulsarrAddress {
  appBaseUrl: string
  port: number
  basePath: string
  webhookSecret: string
}

export interface ArrWebhookClient {
  readonly baseUrl: string
  get(endpoint: 'notification'): Promise<ArrNotification[]>
  post(endpoint: string, payload: object): Promise<object | undefined>
  put(endpoint: string, payload: object): Promise<object | undefined>
  delete(endpoint: string): Promise<void>
}

export interface ArrWebhookTarget {
  product: ArrProduct
  address: PulsarrAddress
  client: ArrWebhookClient
}

export interface ArrNotification {
  id: number
  name: string
  fields?: Array<{
    name: string
    value?: string | number | boolean | null
  }>
}

interface PulsarrWebhooks {
  current?: ArrNotification
  legacy?: ArrNotification
}

/** Unique per Pulsarr host (and port over HTTP) so several Pulsarr instances can each own a hook on one arr. */
export function webhookName(appBaseUrl: string, port: number): string {
  try {
    const url = new URL(appBaseUrl)
    const identifier =
      url.protocol === 'https:' ? url.hostname : `${url.hostname}:${port}`
    return `Pulsarr (${identifier})`
  } catch {
    return `Pulsarr (unknown:${port})`
  }
}

export function webhookUrl(
  address: PulsarrAddress,
  arrBaseUrl: string,
): string {
  let url: URL
  try {
    url = new URL(address.appBaseUrl)
  } catch {
    url = new URL(`http://${address.appBaseUrl}`)
  }
  if (!url.port && url.protocol !== 'https:') {
    url.port = address.port.toString()
  }
  const basePath = normalizeBasePath(address.basePath)
  url.pathname =
    basePath === '/'
      ? '/v1/notifications/webhook'
      : `${basePath}/v1/notifications/webhook`
  const instanceId = arrBaseUrl
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
  url.searchParams.append('instanceId', instanceId)
  return url.toString()
}

function webhookDefinition(target: ArrWebhookTarget) {
  const { product, address, client } = target
  const url = webhookUrl(address, client.baseUrl)
  return {
    ...product.webhook.flags,
    name: webhookName(address.appBaseUrl, address.port),
    fields: product.webhook.fields(url, address.webhookSecret),
    implementationName: 'Webhook',
    implementation: 'Webhook',
    configContract: 'WebhookSettings',
    infoLink: product.webhook.infoLink,
    tags: [],
  }
}

// Legacy hooks also match on URL so another Pulsarr instance's "Pulsarr" hook is never touched
export async function findPulsarrWebhooks(
  target: ArrWebhookTarget,
): Promise<PulsarrWebhooks> {
  const { address, client } = target
  const name = webhookName(address.appBaseUrl, address.port)
  const url = webhookUrl(address, client.baseUrl)
  const hooks = await client.get('notification')
  return {
    current: hooks.find((hook) => hook.name === name),
    legacy: hooks.find(
      (hook) =>
        hook.name === 'Pulsarr' &&
        hook.fields?.some((f) => f.name === 'url' && f.value === url),
    ),
  }
}

/** Updates the existing hook by id, creates one when none exists, and drops a legacy hook once a current one is updated. */
export async function setupWebhook(
  target: ArrWebhookTarget,
  instanceName: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const { product, address, client } = target
  try {
    const definition = webhookDefinition(target)
    const url = webhookUrl(address, client.baseUrl)
    log.debug(
      `Credentials verified, attempting to setup webhook "${definition.name}" with URL for ${product.appName}: ${url}`,
    )
    const { current, legacy } = await findPulsarrWebhooks(target)
    try {
      const existing = current ?? legacy
      if (!existing) {
        await client.post('notification', definition)
        log.info({ url }, `${instanceName} webhook created`)
        return
      }
      await client.put(`notification/${existing.id}`, {
        ...definition,
        id: existing.id,
      })
      if (current && legacy) {
        try {
          await client.delete(`notification/${legacy.id}`)
        } catch (error) {
          log.warn(
            { error, webhookId: legacy.id },
            'Failed to remove the legacy Pulsarr webhook',
          )
        }
      }
      log.info(
        { webhookId: existing.id, url },
        `${instanceName} webhook verified`,
      )
    } catch (error) {
      throw webhookWriteFailure(error)
    }
  } catch (error) {
    if (error instanceof HttpError || error instanceof WebhookCallbackError) {
      throw error
    }
    throw new Error(errorMessage(error), { cause: error })
  }
}

function webhookWriteFailure(error: unknown): Error {
  if (!(error instanceof HttpError)) {
    return new Error(`Failed to create webhook: ${errorMessage(error)}`, {
      cause: error,
    })
  }
  const message = `Failed to create webhook: ${error.message}`
  return isWebhookCallbackFailure(error)
    ? new WebhookCallbackError(message, { cause: error })
    : new HttpError(message, error.status)
}

export async function removeWebhooks(
  target: ArrWebhookTarget,
  log: FastifyBaseLogger,
): Promise<void> {
  const { product, client } = target
  try {
    const { current, legacy } = await findPulsarrWebhooks(target)
    for (const hook of [current, legacy]) {
      if (!hook) continue
      await client.delete(`notification/${hook.id}`)
      log.info(
        `Successfully removed Pulsarr webhook "${hook.name}" for ${product.appName}`,
      )
    }
  } catch (error) {
    log.error({ error }, `Failed to remove webhook for ${product.appName}`)
    throw error
  }
}

/** Posts the arr's notification test for Pulsarr's hook and rethrows the arr's error unchanged. */
export async function sendWebhookTest(
  target: ArrWebhookTarget,
  existingId: number | undefined,
): Promise<void> {
  // The arr's unique-name check skips only the posted id, so the stored hook's id must ride along
  await target.client.post('notification/test', {
    ...webhookDefinition(target),
    ...(existingId === undefined ? {} : { id: existingId }),
  })
}

/** Throws WebhookCallbackError when the arr cannot call Pulsarr back at the target address. */
export async function testWebhookCallback(
  target: ArrWebhookTarget,
): Promise<void> {
  const { current, legacy } = await findPulsarrWebhooks(target)
  try {
    await sendWebhookTest(target, (current ?? legacy)?.id)
  } catch (error) {
    if (error instanceof HttpError && isWebhookCallbackFailure(error)) {
      throw new WebhookCallbackError(error.message, { cause: error })
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new WebhookCallbackError(callbackTimeoutMessage(target.product), {
        cause: error,
      })
    }
    throw error
  }
}

export function callbackTimeoutMessage(product: ArrProduct): string {
  return `${product.appName} did not finish calling Pulsarr back in time. Check the webhook address.`
}
