import {
  ApprovalRoutingFormSchema,
  routingFormValues,
  routingFromValues,
} from '@/lib/approval-routing-form'
import type { components } from '@/types/api.js'

type ApprovalRouting = components['schemas']['ApprovalRouting']

const radarrRouting: ApprovalRouting = {
  instanceId: 3,
  instanceType: 'radarr',
  priority: 70,
  qualityProfile: 6,
  rootFolder: '/movies',
  tags: ['2'],
  searchOnAdd: false,
  minimumAvailability: 'released',
  monitor: 'movieAndCollection',
  syncedInstances: [4],
}

describe('routingFormValues', () => {
  it('stringifies ids and fills missing fields with defaults', () => {
    expect(
      routingFormValues({
        instanceId: 1,
        instanceType: 'sonarr',
        priority: 50,
      }),
    ).toEqual({
      instanceId: '1',
      qualityProfile: '',
      rootFolder: '',
      tags: [],
      searchOnAdd: true,
      seasonMonitoring: 'all',
      seriesType: 'standard',
      minimumAvailability: 'announced',
      monitor: 'movieOnly',
      syncedInstances: [],
    })
  })
})

describe('routingFromValues', () => {
  it('round trips Radarr routing and keeps only its own fields', () => {
    const values = routingFormValues(radarrRouting)

    expect(
      routingFromValues(values, { type: 'radarr', priority: 70, synced: true }),
    ).toEqual({ ...radarrRouting, qualityProfile: '6' })
  })

  it('drops synced instances when they do not apply', () => {
    const values = routingFormValues(radarrRouting)

    expect(
      routingFromValues(values, { type: 'radarr', priority: 70, synced: false })
        .syncedInstances,
    ).toBeUndefined()
  })
})

describe('ApprovalRoutingFormSchema', () => {
  it('requires a quality profile and root folder', () => {
    const result = ApprovalRoutingFormSchema.safeParse({
      ...routingFormValues(radarrRouting),
      qualityProfile: '',
      rootFolder: '',
    })

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Choose a quality profile.',
      'Choose a root folder.',
    ])
  })
})
