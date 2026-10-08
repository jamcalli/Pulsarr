import {
  fallbackLine,
  routeDestination,
} from '@/features/library/lib/content-router/route-list'

describe('routeDestination', () => {
  it('names the instance and joins what is set', () => {
    expect(
      routeDestination('radarr', {
        exclude: false,
        instanceName: 'Radarr',
        qualityProfile: 'HD-1080p',
        rootFolder: null,
      }),
    ).toEqual({ kind: 'instance', name: 'Radarr', detail: 'HD-1080p' })
  })

  it('says a skip rule is not routed', () => {
    expect(
      routeDestination('sonarr', {
        exclude: true,
        instanceName: 'Sonarr',
        qualityProfile: null,
        rootFolder: null,
      }),
    ).toEqual({ kind: 'skipped', detail: 'Matching shows are skipped' })
  })

  it('reads a route without an instance as not routed', () => {
    expect(
      routeDestination('radarr', {
        exclude: false,
        instanceName: null,
        qualityProfile: null,
        rootFolder: '/movies',
      }),
    ).toEqual({ kind: 'skipped', detail: 'This route has no instance' })
  })
})

describe('fallbackLine', () => {
  it('says so when no instance is set up', () => {
    expect(fallbackLine('radarr', null)).toBe('No instance is set up yet.')
  })
})
