import {
  HttpError,
  WebhookCallbackError,
} from '@root/types/arr-connection.types.js'
import { type ArrProduct, RADARR, SONARR } from '@services/arr/arr-product.js'
import type {
  ArrNotification,
  ArrWebhookClient,
  ArrWebhookTarget,
  PulsarrAddress,
} from '@services/arr/arr-webhook.js'
import {
  removeWebhooks,
  sendWebhookTest,
  setupWebhook,
  testWebhookCallback,
  webhookName,
  webhookUrl,
} from '@services/arr/arr-webhook.js'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'

const ADDRESS: PulsarrAddress = {
  appBaseUrl: 'http://localhost',
  port: 3003,
  basePath: '/',
  webhookSecret: 'secret',
}
const ARR_BASE_URL = 'http://arr.test'
const NAME = 'Pulsarr (localhost:3003)'
const HOOK_URL =
  'http://localhost:3003/v1/notifications/webhook?instanceId=arrtest'

type Call =
  | { method: 'POST' | 'PUT'; endpoint: string; body: object }
  | { method: 'DELETE'; endpoint: string }

class FakeClient implements ArrWebhookClient {
  readonly baseUrl = ARR_BASE_URL
  readonly calls: Call[] = []
  failWrite: Error | null = null
  failDelete: Error | null = null

  constructor(private readonly hooks: ArrNotification[]) {}

  async get(): Promise<ArrNotification[]> {
    return this.hooks
  }

  async post(endpoint: string, body: object): Promise<undefined> {
    this.calls.push({ method: 'POST', endpoint, body })
    if (this.failWrite) throw this.failWrite
    return undefined
  }

  async put(endpoint: string, body: object): Promise<undefined> {
    this.calls.push({ method: 'PUT', endpoint, body })
    if (this.failWrite) throw this.failWrite
    return undefined
  }

  async delete(endpoint: string): Promise<void> {
    this.calls.push({ method: 'DELETE', endpoint })
    if (this.failDelete) throw this.failDelete
  }
}

function hook(id: number, name: string, url = 'http://stale'): ArrNotification {
  return { id, name, fields: [{ name: 'url', value: url }] }
}

function targetFor(
  product: ArrProduct,
  hooks: ArrNotification[],
): { target: ArrWebhookTarget; client: FakeClient } {
  const client = new FakeClient(hooks)
  return { target: { product, address: ADDRESS, client }, client }
}

function endpoints(client: FakeClient): string[] {
  return client.calls.map((call) => `${call.method} ${call.endpoint}`)
}

function postedBody(client: FakeClient): object | undefined {
  const call = client.calls[0]
  return call && call.method !== 'DELETE' ? call.body : undefined
}

const callbackFailure = new HttpError('Unable to send test message', 400, [
  { propertyName: 'Url', errorMessage: 'Unable to send test message' },
])

describe('webhook address', () => {
  it('names the hook after the host and port over HTTP', () => {
    expect(webhookName('http://localhost', 3003)).toBe(NAME)
  })

  it('drops the port over HTTPS', () => {
    expect(webhookName('https://pulsarr.example', 443)).toBe(
      'Pulsarr (pulsarr.example)',
    )
  })

  it('builds the URL with the base path and the arr instance id', () => {
    expect(
      webhookUrl({ ...ADDRESS, basePath: 'pulsarr/' }, 'https://Arr.Test:8989'),
    ).toBe(
      'http://localhost:3003/pulsarr/v1/notifications/webhook?instanceId=arrtest8989',
    )
  })
})

describe.each([
  { product: SONARR, flag: 'onImportComplete' },
  { product: RADARR, flag: 'onMovieAdded' },
])('$product.appName webhook lifecycle', ({ product, flag }) => {
  const log = createMockLogger()

  it('updates the current hook by id and removes the legacy hook', async () => {
    const { target, client } = targetFor(product, [
      hook(172, NAME),
      hook(50, 'Pulsarr', HOOK_URL),
    ])

    await setupWebhook(target, 'Main', log)

    expect(endpoints(client)).toEqual([
      'PUT notification/172',
      'DELETE notification/50',
    ])
    expect(postedBody(client)).toMatchObject({
      id: 172,
      name: NAME,
      onDownload: true,
      [flag]: false,
      infoLink: product.webhook.infoLink,
    })
  })

  it('renames a legacy hook by updating it in place', async () => {
    const { target, client } = targetFor(product, [
      hook(50, 'Pulsarr', HOOK_URL),
    ])

    await setupWebhook(target, 'Main', log)

    expect(endpoints(client)).toEqual(['PUT notification/50'])
    expect(postedBody(client)).toMatchObject({ id: 50, name: NAME })
  })

  it('creates a hook when none exists', async () => {
    const { target, client } = targetFor(product, [
      hook(50, 'Pulsarr', 'http://other-pulsarr'),
    ])

    await setupWebhook(target, 'Main', log)

    expect(endpoints(client)).toEqual(['POST notification'])
    expect(postedBody(client)).not.toHaveProperty('id')
    expect(postedBody(client)).toMatchObject({
      fields: product.webhook.fields(HOOK_URL, 'secret'),
    })
  })

  it('keeps the updated hook when the legacy cleanup fails', async () => {
    const { target, client } = targetFor(product, [
      hook(172, NAME),
      hook(50, 'Pulsarr', HOOK_URL),
    ])
    client.failDelete = new HttpError('boom', 500)

    await setupWebhook(target, 'Main', log)

    expect(endpoints(client)).toEqual([
      'PUT notification/172',
      'DELETE notification/50',
    ])
  })

  it('throws WebhookCallbackError when the arr cannot call back', async () => {
    const { target, client } = targetFor(product, [hook(172, NAME)])
    client.failWrite = callbackFailure

    const result = setupWebhook(target, 'Main', log)

    await expect(result).rejects.toBeInstanceOf(WebhookCallbackError)
    await expect(result).rejects.toThrow(
      'Failed to create webhook: Unable to send test message',
    )
  })

  it('keeps the status of any other arr rejection', async () => {
    const { target, client } = targetFor(product, [])
    client.failWrite = new HttpError('Name should be unique', 400, [
      { propertyName: 'Name', errorMessage: 'Name should be unique' },
    ])

    const result = setupWebhook(target, 'Main', log)

    await expect(result).rejects.toBeInstanceOf(HttpError)
    await expect(result).rejects.not.toBeInstanceOf(WebhookCallbackError)
    await expect(result).rejects.toMatchObject({ status: 400 })
  })

  it('removes both the current and the legacy hook', async () => {
    const { target, client } = targetFor(product, [
      hook(172, NAME),
      hook(50, 'Pulsarr', HOOK_URL),
      hook(9, 'Pulsarr', 'http://other-pulsarr'),
    ])

    await removeWebhooks(target, log)

    expect(endpoints(client)).toEqual([
      'DELETE notification/172',
      'DELETE notification/50',
    ])
  })

  it('tests the callback with the current hook id', async () => {
    const { target, client } = targetFor(product, [
      hook(172, NAME),
      hook(50, 'Pulsarr', HOOK_URL),
    ])

    await testWebhookCallback(target)

    expect(endpoints(client)).toEqual(['POST notification/test'])
    expect(postedBody(client)).toMatchObject({ id: 172, name: NAME })
  })

  it('tests the callback without an id when no hook exists', async () => {
    const { target, client } = targetFor(product, [])

    await testWebhookCallback(target)

    expect(postedBody(client)).not.toHaveProperty('id')
  })

  it('throws WebhookCallbackError when the callback test fails', async () => {
    const { target, client } = targetFor(product, [hook(172, NAME)])
    client.failWrite = callbackFailure

    const result = testWebhookCallback(target)

    await expect(result).rejects.toBeInstanceOf(WebhookCallbackError)
    await expect(result).rejects.toThrow('Unable to send test message')
  })

  it('sends the same definition it registers', async () => {
    const tester = targetFor(product, [])
    const registrar = targetFor(product, [])

    await sendWebhookTest(tester.target, undefined)
    await setupWebhook(registrar.target, 'Main', log)

    expect(postedBody(tester.client)).toEqual(postedBody(registrar.client))
  })
})
