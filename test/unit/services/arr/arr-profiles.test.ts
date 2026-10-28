import { ArrClient } from '@services/arr/arr-client.js'
import type { ArrInstanceContext } from '@services/arr/arr-instance-cache.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import {
  ArrQualityProfiles,
  resolveQualityProfileId,
  resolveRootFolder,
} from '@services/arr/arr-profiles.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

const BASE = 'http://arr.test/api/v3'
const PROFILES = [
  { id: 3, name: 'HD' },
  { id: 8, name: 'Ultra' },
]

function context(appName: string): ArrInstanceContext {
  const client = new ArrClient({
    appName,
    baseUrl: 'http://arr.test',
    apiKey: 'key',
    timeoutMs: 1000,
  })
  return {
    appName,
    log: createMockLogger(),
    client: () => client,
    instanceId: () => 1,
  }
}

describe.each([SONARR, RADARR])('$appName quality profiles', ({ appName }) => {
  it('caches profiles for the TTL and keeps them when a refresh fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      let calls = 0
      server.use(
        http.get(`${BASE}/qualityprofile`, () => {
          calls++
          return calls === 1
            ? HttpResponse.json(PROFILES)
            : new HttpResponse(null, { status: 500 })
        }),
      )
      const profiles = new ArrQualityProfiles(context(appName))

      await profiles.list()
      await profiles.list()
      expect(calls).toBe(1)

      vi.advanceTimersByTime(30_001)
      await expect(profiles.list()).resolves.toEqual(PROFILES)
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    { configured: null, expected: 3 },
    { configured: 8, expected: 8 },
    { configured: '8', expected: 8 },
    { configured: 'ultra', expected: 8 },
    { configured: 'missing', expected: 3 },
  ])(
    'resolves $configured to profile $expected',
    ({ configured, expected }) => {
      expect(
        resolveQualityProfileId(context(appName), PROFILES, configured),
      ).toBe(expected)
    },
  )

  it('throws without any profile', () => {
    expect(() => resolveQualityProfileId(context(appName), [], null)).toThrow(
      `No quality profiles configured in ${appName}`,
    )
  })

  it('prefers the override root folder, then the configured one', async () => {
    await expect(
      resolveRootFolder(context(appName), '/configured', '/override'),
    ).resolves.toBe('/override')
    await expect(
      resolveRootFolder(context(appName), '/configured'),
    ).resolves.toBe('/configured')
  })

  it("falls back to the arr's first root folder", async () => {
    server.use(
      http.get(`${BASE}/rootfolder`, () =>
        HttpResponse.json([
          { id: 1, path: '/first' },
          { id: 2, path: '/second' },
        ]),
      ),
    )

    await expect(resolveRootFolder(context(appName), null)).resolves.toBe(
      '/first',
    )
  })

  it('throws when the arr has no root folder', async () => {
    server.use(http.get(`${BASE}/rootfolder`, () => HttpResponse.json([])))

    await expect(resolveRootFolder(context(appName), null)).rejects.toThrow(
      `No root folders configured in ${appName}`,
    )
  })
})
