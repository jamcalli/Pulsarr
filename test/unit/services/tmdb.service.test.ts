import type { TmdbWatchProvider } from '@root/types/tmdb.types.js'
import { CacheRegistry } from '@services/cache-registry.service.js'
import { PROVIDER_CACHE_TTL_MS, TmdbService } from '@services/tmdb.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../mocks/logger.js'
import { server } from '../../setup/msw-setup.js'

function provider(id: number): TmdbWatchProvider {
  return {
    provider_id: id,
    provider_name: `Provider ${id}`,
    logo_path: `/${id}.png`,
    display_priority: id,
  }
}

describe('TmdbService provider cache', () => {
  let now: number
  let calls: Record<string, number>
  let tvStatus: number
  let service: TmdbService

  beforeEach(() => {
    now = 1
    calls = {}
    tvStatus = 200
    server.use(
      http.get(
        'https://api.themoviedb.org/3/watch/providers/:kind',
        ({ params, request }) => {
          const region = new URL(request.url).searchParams.get('watch_region')
          const key = `${params.kind}:${region}`
          calls[key] = (calls[key] ?? 0) + 1
          if (params.kind === 'tv' && tvStatus !== 200) {
            return new HttpResponse(null, { status: tvStatus })
          }
          return HttpResponse.json({
            results: [provider(params.kind === 'movie' ? 1 : 2)],
          })
        },
      ),
    )
    const fastify = {
      caches: new CacheRegistry({ now: () => now }),
      config: { tmdbApiKey: 'key', tmdbRegion: 'US' },
    } as unknown as FastifyInstance
    service = new TmdbService(createMockLogger(), fastify)
  })

  it('keeps a region providers for the TTL', async () => {
    await expect(service.getAvailableProviders()).resolves.toEqual([
      provider(1),
      provider(2),
    ])
    now += PROVIDER_CACHE_TTL_MS
    await service.getAvailableProviders()
    expect(calls['movie:US']).toBe(1)

    now += 1
    await service.getAvailableProviders()
    expect(calls['movie:US']).toBe(2)
  })

  it('keys providers by region', async () => {
    await service.getAvailableProviders('US')
    await service.getAvailableProviders('GB')

    expect(calls).toEqual({
      'movie:US': 1,
      'tv:US': 1,
      'movie:GB': 1,
      'tv:GB': 1,
    })
  })

  it('shares one fetch between concurrent reads', async () => {
    await Promise.all([
      service.getAvailableProviders(),
      service.getAvailableProviders(),
    ])

    expect(calls['movie:US']).toBe(1)
  })

  it('returns a partial list without caching it', async () => {
    tvStatus = 500

    await expect(service.getAvailableProviders()).resolves.toEqual([
      provider(1),
    ])
    tvStatus = 200
    await expect(service.getAvailableProviders()).resolves.toEqual([
      provider(1),
      provider(2),
    ])
    expect(calls['movie:US']).toBe(2)
  })

  it('clears one region or every region', async () => {
    await service.getAvailableProviders('US')
    await service.getAvailableProviders('GB')

    service.clearProviderCache('US')
    await service.getAvailableProviders('US')
    await service.getAvailableProviders('GB')
    expect(calls['movie:US']).toBe(2)
    expect(calls['movie:GB']).toBe(1)

    service.clearProviderCache()
    await service.getAvailableProviders('GB')
    expect(calls['movie:GB']).toBe(2)
  })
})
