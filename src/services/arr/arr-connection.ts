import {
  type ArrQualityProfile,
  type ArrRootFolder,
  type ArrTag,
  type ConnectionTestResult,
  HttpError,
} from '@root/types/arr-connection.types.js'
import type { HealthCheckResult } from '@root/types/service-result.types.js'
import {
  isSystemStatus,
  type SystemStatus,
} from '@root/types/system-status.types.js'
import {
  ARR_CONNECTION_TEST_TIMEOUT_MS,
  ArrClient,
  type ArrCredentials,
} from '@services/arr/arr-client.js'
import type { ArrProduct } from '@services/arr/arr-product.js'
import {
  type ArrWebhookTarget,
  callbackTimeoutMessage,
  findPulsarrWebhooks,
  type PulsarrAddress,
  sendWebhookTest,
  testWebhookCallback,
} from '@services/arr/arr-webhook.js'
import { isWebhookCallbackFailure } from '@utils/arr-error.js'
import { errorMessage, toError } from '@utils/error-message.js'
import { ensureHttpScheme } from '@utils/url.js'
import type { FastifyBaseLogger } from 'fastify'

export interface ArrProbeResult {
  qualityProfiles: ArrQualityProfile[]
  rootFolders: ArrRootFolder[]
  tags: ArrTag[]
}

type ConnectionFailure = Extract<ConnectionTestResult, { success: false }>

function credentialClient(
  product: ArrProduct,
  credentials: ArrCredentials,
): ArrClient {
  return new ArrClient({
    baseUrl: credentials.baseUrl,
    apiKey: credentials.apiKey,
    appName: product.appName,
    timeoutMs: ARR_CONNECTION_TEST_TIMEOUT_MS,
  })
}

function errorCode(error: Error): string | undefined {
  for (const source of [error, error.cause]) {
    if (
      typeof source === 'object' &&
      source !== null &&
      'code' in source &&
      typeof source.code === 'string'
    ) {
      return source.code
    }
  }
  return undefined
}

export function connectionErrorMessage(
  error: Error,
  appName: ArrProduct['appName'],
): string {
  const code = errorCode(error)
  const reports = (name: string) =>
    code === name || error.message.includes(name)
  if (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    code === 'ABORT_ERR'
  ) {
    return `Connection timeout. Please check your ${appName} URL and network connection.`
  }
  if (reports('ECONNREFUSED')) {
    return `Connection refused. Please check if ${appName} is running and the URL is correct.`
  }
  if (reports('ENOTFOUND')) {
    return `Server not found. Please check your ${appName} URL.`
  }
  if (reports('ETIMEDOUT')) {
    return 'Connection timeout. Please check your network and firewall settings.'
  }
  if (reports('ECONNRESET')) {
    return 'Connection was reset. Please check your network stability.'
  }
  return `Network error. Please check your connection and ${appName} URL.`
}

function failure(
  code: ConnectionFailure['code'],
  message: string,
): ConnectionFailure {
  return { success: false, code, message }
}

async function statusFailure(
  product: ArrProduct,
  client: ArrClient,
): Promise<ConnectionFailure | null> {
  const { appName } = product
  let status: SystemStatus
  try {
    status = await client.get<SystemStatus>('system/status')
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) {
        return failure(
          'auth',
          'Authentication failed. Please check your API key.',
        )
      }
      if (error.status === 404) {
        return failure(
          'invalid',
          `API endpoint not found. Please check your ${appName} URL.`,
        )
      }
      return failure(
        'unreachable',
        `Connection failed (${error.status}): ${error.message}`,
      )
    }
    if (error instanceof SyntaxError) {
      return failure('invalid', 'Failed to parse response from server')
    }
    return failure(
      'unreachable',
      connectionErrorMessage(toError(error), appName),
    )
  }
  if (!isSystemStatus(status)) {
    return failure('invalid', 'Invalid response from server')
  }
  if (status.appName.toLowerCase() !== appName.toLowerCase()) {
    return failure(
      'invalid',
      `Connected service does not appear to be a valid ${appName} application`,
    )
  }
  return null
}

function notificationFailure(
  error: unknown,
  appName: ArrProduct['appName'],
): ConnectionFailure {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return failure(
        'auth',
        `Connected to ${appName} but cannot access notification API. Check API key permissions.`,
      )
    }
    return failure('invalid', error.message)
  }
  if (error instanceof Error) {
    return failure('unreachable', connectionErrorMessage(error, appName))
  }
  throw error
}

async function callbackFailure(
  target: ArrWebhookTarget,
  existingId: number | undefined,
): Promise<ConnectionFailure | null> {
  try {
    await sendWebhookTest(target, existingId)
    return null
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return failure(
        'webhook_callback_failed',
        callbackTimeoutMessage(target.product),
      )
    }
    if (error instanceof HttpError) {
      return failure(
        isWebhookCallbackFailure(error) ? 'webhook_callback_failed' : 'invalid',
        error.message,
      )
    }
    throw error
  }
}

/** Checks unsaved credentials, the notification API and the webhook callback without touching any configured instance. */
export async function testConnection(
  product: ArrProduct,
  credentials: ArrCredentials,
  address: PulsarrAddress,
  log: FastifyBaseLogger,
): Promise<ConnectionTestResult> {
  const { appName } = product
  if (!credentials.baseUrl || !credentials.apiKey) {
    return failure('unreachable', 'Base URL and API key are required')
  }
  if (!URL.canParse(ensureHttpScheme(credentials.baseUrl))) {
    return failure(
      'unreachable',
      `Invalid URL format. Please check your ${appName} URL.`,
    )
  }
  try {
    const client = credentialClient(product, credentials)
    const status = await statusFailure(product, client)
    if (status) return status

    const target: ArrWebhookTarget = { product, address, client }
    let existingId: number | undefined
    try {
      const { current, legacy } = await findPulsarrWebhooks(target)
      existingId = (current ?? legacy)?.id
    } catch (error) {
      return notificationFailure(error, appName)
    }

    const callback = await callbackFailure(target, existingId)
    if (callback) return callback

    return {
      success: true,
      code: null,
      message: 'Connection successful and webhook API accessible',
    }
  } catch (error) {
    log.error({ error }, 'Connection test error:')
    return failure(
      'unreachable',
      error instanceof Error
        ? connectionErrorMessage(error, appName)
        : 'Connection test failed. Please check your settings and try again.',
    )
  }
}

export async function probe(
  product: ArrProduct,
  credentials: ArrCredentials,
): Promise<ArrProbeResult> {
  const client = credentialClient(product, credentials)
  const [qualityProfiles, rootFolders, tags] = await Promise.all([
    client.get<ArrQualityProfile[]>('qualityprofile'),
    client.get<ArrRootFolder[]>('rootfolder'),
    client.get<ArrTag[]>('tag'),
  ])
  return { qualityProfiles, rootFolders, tags }
}

export async function checkHealth(
  product: ArrProduct,
  credentials: ArrCredentials,
): Promise<HealthCheckResult> {
  try {
    await credentialClient(product, credentials).get<SystemStatus>(
      'system/status',
    )
    return { healthy: true }
  } catch (error) {
    return {
      healthy: false,
      error:
        error instanceof HttpError
          ? `${product.appName} responded with status ${error.status}`
          : errorMessage(error),
    }
  }
}

/** Throws WebhookCallbackError when the arr behind these credentials cannot call Pulsarr back at the address. */
export async function testWebhookAddress(
  product: ArrProduct,
  credentials: ArrCredentials,
  address: PulsarrAddress,
): Promise<void> {
  await testWebhookCallback({
    product,
    address,
    client: credentialClient(product, credentials),
  })
}
