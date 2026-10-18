import {
  createPayload,
  endpointFormValues,
  endpointSaveError,
  testPayload,
  updatePayload,
} from '@/features/notifications/lib/endpoint-form'
import { EndpointFormSchema } from '@/features/notifications/lib/endpoint-form.schema'
import type { components } from '@/types/api.js'

const SAVED: components['schemas']['WebhookEndpoint'] = {
  id: 2,
  name: 'n8n',
  url: 'https://n8n.example.com/h',
  authHeaderName: 'Authorization',
  authHeaderValue: 'Bearer x',
  eventTypes: ['approval.created', 'media.available'],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('endpoint-form', () => {
  it('starts a new endpoint enabled with no events', () => {
    expect(endpointFormValues(null)).toEqual({
      name: '',
      url: '',
      authHeaderName: '',
      authHeaderValue: '',
      enabled: true,
      eventTypes: [],
    })
  })

  it('orders saved events like the list', () => {
    expect(endpointFormValues(SAVED).eventTypes).toEqual([
      'media.available',
      'approval.created',
    ])
  })

  it('omits empty header fields on create', () => {
    expect(
      createPayload({
        ...endpointFormValues(null),
        name: 'Hook',
        url: 'https://a.example.com',
        eventTypes: ['user.created'],
      }),
    ).toEqual({
      name: 'Hook',
      url: 'https://a.example.com',
      eventTypes: ['user.created'],
      enabled: true,
    })
  })

  it('sends only changed fields on update, null for a cleared header', () => {
    const values = endpointFormValues(SAVED)
    expect(updatePayload(SAVED, values)).toEqual({})
    expect(updatePayload(SAVED, { ...values, name: 'n8n 2' })).toEqual({
      name: 'n8n 2',
    })
    expect(
      updatePayload(SAVED, {
        ...values,
        authHeaderName: '',
        authHeaderValue: '',
      }),
    ).toEqual({ authHeaderName: null, authHeaderValue: null })
    expect(
      updatePayload(SAVED, { ...values, authHeaderValue: 'Bearer y' }),
    ).toEqual({ authHeaderName: 'Authorization', authHeaderValue: 'Bearer y' })
  })

  it('needs both header parts or neither, and one event', () => {
    const values = endpointFormValues(SAVED)
    expect(endpointSaveError(values)).toBeNull()
    expect(endpointSaveError({ ...values, eventTypes: [] })).toBe(
      'Pick at least one event.',
    )
    expect(endpointSaveError({ ...values, authHeaderName: ' ' })).toBe(
      'Add a header name.',
    )
    expect(endpointSaveError({ ...values, authHeaderValue: '' })).toBe(
      'Add a header value.',
    )
    expect(
      EndpointFormSchema.safeParse({ ...values, authHeaderValue: '' }).error
        ?.issues[0]?.path,
    ).toEqual(['authHeaderValue'])
  })

  it('leaves a half-set header out of the test', () => {
    expect(
      testPayload({
        url: ' https://a.example.com ',
        authHeaderName: 'Authorization',
        authHeaderValue: '',
      }),
    ).toEqual({ url: 'https://a.example.com' })
  })
})
