import {
  lookupByGuid,
  searchByGuid,
} from '@services/plex-server/metadata/metadata-operations.js'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const SERVER_URL = 'http://plex.test'
const SEARCH_URL = `${SERVER_URL}/library/all`
const GUID = 'plex://movie/5d7768255af944001f1f65a7'
const ITEM = { ratingKey: '153931', title: 'Movie', guid: GUID }

function serveSearch(response: () => Response): { hits: () => number } {
  let hits = 0
  server.use(
    http.get(SEARCH_URL, () => {
      hits++
      return response()
    }),
  )
  return { hits: () => hits }
}

const timedOutSignal = () =>
  AbortSignal.abort(new DOMException('timed out', 'TimeoutError'))

describe('metadata-operations', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('lookupByGuid', () => {
    const lookup = (guid = GUID, token = 'token') =>
      lookupByGuid(guid, SERVER_URL, token, createMockLogger())

    it('returns the items on a match', async () => {
      serveSearch(() =>
        HttpResponse.json({ MediaContainer: { size: 1, Metadata: [ITEM] } }),
      )

      expect(await lookup()).toEqual({ status: 'found', items: [ITEM] })
    })

    it('reports none on a 200 with an empty container', async () => {
      serveSearch(() => HttpResponse.json({ MediaContainer: { size: 0 } }))

      expect(await lookup()).toEqual({ status: 'none' })
    })

    it('reports an error on a 401 without retrying', async () => {
      const search = serveSearch(
        () => new HttpResponse('Unauthorized', { status: 401 }),
      )

      expect(await lookup()).toEqual({ status: 'error' })
      expect(search.hits()).toBe(1)
    })

    it('reports an error on a 404', async () => {
      serveSearch(() => new HttpResponse(null, { status: 404 }))

      expect(await lookup()).toEqual({ status: 'error' })
    })

    it('refuses an empty guid without calling Plex', async () => {
      const search = serveSearch(() =>
        HttpResponse.json({ MediaContainer: { size: 1, Metadata: [ITEM] } }),
      )

      expect(await lookup('  ')).toEqual({ status: 'error' })
      expect(search.hits()).toBe(0)
    })

    it('reports an error without a token', async () => {
      const search = serveSearch(() =>
        HttpResponse.json({ MediaContainer: { size: 1, Metadata: [ITEM] } }),
      )

      expect(await lookup(GUID, '')).toEqual({ status: 'error' })
      expect(search.hits()).toBe(0)
    })

    it('retries a timed-out search once', async () => {
      vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timedOutSignal())
      serveSearch(() =>
        HttpResponse.json({ MediaContainer: { size: 1, Metadata: [ITEM] } }),
      )

      expect(await lookup()).toEqual({ status: 'found', items: [ITEM] })
    })

    it('reports an error when both attempts time out', async () => {
      vi.spyOn(AbortSignal, 'timeout')
        .mockReturnValueOnce(timedOutSignal())
        .mockReturnValueOnce(timedOutSignal())
      serveSearch(() =>
        HttpResponse.json({ MediaContainer: { size: 1, Metadata: [ITEM] } }),
      )

      expect(await lookup()).toEqual({ status: 'error' })
    })
  })

  describe('searchByGuid', () => {
    it('returns an empty list for none and for errors', async () => {
      serveSearch(() => new HttpResponse(null, { status: 401 }))

      expect(
        await searchByGuid(GUID, SERVER_URL, 'token', createMockLogger()),
      ).toEqual([])
    })
  })
})
