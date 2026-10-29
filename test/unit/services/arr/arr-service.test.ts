import type { ExistenceCheckResult } from '@root/types/service-result.types.js'
import { RADARR, SONARR } from '@services/arr/arr-product.js'
import { RadarrService } from '@services/radarr.service.js'
import { SonarrService } from '@services/sonarr.service.js'
import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../mocks/logger.js'
import { server } from '../../../setup/msw-setup.js'

interface Subject {
  existsInLibrary(id: number): Promise<ExistenceCheckResult>
  findIdInLibrary(id: number): Promise<number | undefined>
  deleteByExternalId(id: number): Promise<void>
  fetchLibrary(): Promise<number>
  isExcluded(id: number): Promise<boolean>
}

const BASE_INSTANCE = {
  id: 1,
  apiKey: 'placeholder',
  bypassIgnored: false,
  tags: [],
  isDefault: true,
}

async function sonarr(): Promise<Subject> {
  const service = new SonarrService(
    createMockLogger(),
    'http://localhost',
    3003,
    {} as FastifyInstance,
  )
  await service.initialize({
    ...BASE_INSTANCE,
    name: 'Test Sonarr',
    baseUrl: 'http://sonarr.test',
    seasonMonitoring: 'all',
    monitorNewItems: 'all',
  })
  return {
    existsInLibrary: (id) => service.existsInLibrary(id),
    findIdInLibrary: async (id) => (await service.findInLibrary(id))?.id,
    deleteByExternalId: (id) =>
      service.deleteFromSonarr(
        { title: 'Show', type: 'show', guids: [`tvdb:${id}`] },
        false,
      ),
    fetchLibrary: async () => (await service.fetchSeries(false)).size,
    isExcluded: (id) => service.isTvdbIdExcluded(id),
  }
}

async function radarr(): Promise<Subject> {
  const service = new RadarrService(
    createMockLogger(),
    'http://localhost',
    3003,
    {} as FastifyInstance,
  )
  await service.initialize({
    ...BASE_INSTANCE,
    name: 'Test Radarr',
    baseUrl: 'http://radarr.test',
  })
  return {
    existsInLibrary: (id) => service.existsInLibrary(id),
    findIdInLibrary: async (id) => (await service.findInLibrary(id))?.id,
    deleteByExternalId: (id) =>
      service.deleteFromRadarr(
        { title: 'Movie', type: 'movie', guids: [`tmdb:${id}`] },
        false,
      ),
    fetchLibrary: async () => (await service.fetchMovies(false)).size,
    isExcluded: (id) => service.isTmdbIdExcluded(id),
  }
}

describe.each([
  {
    product: SONARR,
    base: 'http://sonarr.test/api/v3',
    exclusionsPath: 'importlistexclusion/paged',
    exclusionRecord: (id: number) => ({ id: 1, tvdbId: id, title: 'Gone' }),
    libraryRecord: (id: number) => ({ id: 77, title: 'Show', tvdbId: id }),
    build: sonarr,
  },
  {
    product: RADARR,
    base: 'http://radarr.test/api/v3',
    exclusionsPath: 'exclusions/paged',
    exclusionRecord: (id: number) => ({
      id: 1,
      tmdbId: id,
      movieTitle: 'Gone',
      movieYear: 2020,
    }),
    libraryRecord: (id: number) => ({ id: 77, title: 'Movie', tmdbId: id }),
    build: radarr,
  },
])(
  '$product.appName library reads',
  ({
    product,
    base,
    exclusionsPath,
    exclusionRecord,
    libraryRecord,
    build,
  }) => {
    const libraryUrl = `${base}/${product.itemEndpoint}`
    let subject: Subject
    let libraryQueries: string[]

    function serveLibrary(ids: number[]) {
      server.use(
        http.get(libraryUrl, ({ request }) => {
          const url = new URL(request.url)
          libraryQueries.push(url.search)
          const filter = url.searchParams.get(product.idField)
          const matching =
            filter === null ? ids : ids.filter((id) => id === Number(filter))
          return HttpResponse.json(matching.map((id) => libraryRecord(id)))
        }),
      )
    }

    function serveExclusions(ids: number[]): { calls: number } {
      const counter = { calls: 0 }
      server.use(
        http.get(`${base}/${exclusionsPath}`, () => {
          counter.calls++
          return HttpResponse.json({
            page: 1,
            pageSize: 1000,
            totalRecords: ids.length,
            records: ids.map((id) => exclusionRecord(id)),
          })
        }),
      )
      return counter
    }

    beforeEach(async () => {
      libraryQueries = []
      subject = await build()
    })

    describe('existsInLibrary', () => {
      it(`filters the local library by ${product.idField}`, async () => {
        serveLibrary([42])

        await expect(subject.existsInLibrary(42)).resolves.toEqual({
          found: true,
          checked: true,
          serviceName: product.appName,
        })
        expect(libraryQueries).toEqual([`?${product.idField}=42`])
      })

      it('reports a miss as checked and not found', async () => {
        serveLibrary([42])

        await expect(subject.existsInLibrary(7)).resolves.toEqual({
          found: false,
          checked: true,
          serviceName: product.appName,
        })
      })

      it('reports a failed read as unchecked', async () => {
        server.use(
          http.get(libraryUrl, () => new HttpResponse(null, { status: 500 })),
        )

        await expect(subject.existsInLibrary(42)).resolves.toMatchObject({
          found: false,
          checked: false,
          serviceName: product.appName,
        })
      })

      it('returns the arr item id from findInLibrary', async () => {
        serveLibrary([42])

        await expect(subject.findIdInLibrary(42)).resolves.toBe(77)
        await expect(subject.findIdInLibrary(7)).resolves.toBeUndefined()
      })
    })

    describe('delete without a stored arr id', () => {
      it('finds the item by its external id and deletes it', async () => {
        serveLibrary([42])
        const deleted: string[] = []
        server.use(
          http.delete(`${libraryUrl}/:id`, ({ params }) => {
            deleted.push(String(params.id))
            return HttpResponse.json({})
          }),
        )

        await subject.deleteByExternalId(42)

        expect(deleted).toEqual(['77'])
        expect(libraryQueries).toEqual([`?${product.idField}=42`])
      })

      it('throws when the arr does not have the item', async () => {
        serveLibrary([])

        await expect(subject.deleteByExternalId(42)).rejects.toThrow(
          'Could not find',
        )
      })
    })

    describe('exclusions', () => {
      it('serves the library fetch and the exclusion check from one exclusion fetch within the TTL', async () => {
        serveLibrary([42])
        const counter = serveExclusions([9])

        await expect(subject.fetchLibrary()).resolves.toBe(2)
        await expect(subject.isExcluded(9)).resolves.toBe(true)
        await expect(subject.fetchLibrary()).resolves.toBe(2)

        expect(counter.calls).toBe(1)
      })
    })
  },
)
