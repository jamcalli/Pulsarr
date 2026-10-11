import {
  getCurrentLabels,
  lookupMetadata,
  removeSpecificLabels,
} from '@services/plex-server/labels/label-operations.js'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const SERVER_URL = 'http://plex.test'
const METADATA_URL = `${SERVER_URL}/library/metadata/123`

function serveMetadata(
  response: () => Response,
  onWrite: () => void = () => {},
): void {
  server.use(
    http.get(METADATA_URL, response),
    http.put(METADATA_URL, () => {
      onWrite()
      return new HttpResponse(null, { status: 200 })
    }),
  )
}

describe('label-operations', () => {
  it('returns null when the metadata read fails', async () => {
    serveMetadata(() => new HttpResponse(null, { status: 500 }))

    const labels = await getCurrentLabels(
      '123',
      SERVER_URL,
      'token',
      createMockLogger(),
    )

    expect(labels).toBeNull()
  })

  it('returns an empty list for an item with no labels', async () => {
    serveMetadata(() =>
      HttpResponse.json({
        MediaContainer: { Metadata: [{ ratingKey: '123', title: 'Movie' }] },
      }),
    )

    const labels = await getCurrentLabels(
      '123',
      SERVER_URL,
      'token',
      createMockLogger(),
    )

    expect(labels).toEqual([])
  })

  it('reports a failed read as a failed removal and writes nothing', async () => {
    let writes = 0
    serveMetadata(
      () => new HttpResponse(null, { status: 500 }),
      () => {
        writes++
      },
    )

    const removed = await removeSpecificLabels(
      '123',
      ['pulsarr:alice'],
      SERVER_URL,
      'token',
      createMockLogger(),
    )

    expect(removed).toBe(false)
    expect(writes).toBe(0)
  })

  describe('lookupMetadata', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    const lookup = () =>
      lookupMetadata('123', SERVER_URL, 'token', createMockLogger())

    const timedOutSignal = () =>
      AbortSignal.abort(new DOMException('timed out', 'TimeoutError'))

    it('reports missing on a 404', async () => {
      serveMetadata(() => new HttpResponse(null, { status: 404 }))

      expect(await lookup()).toEqual({ status: 'missing' })
    })

    it('reports missing on an empty Metadata array', async () => {
      serveMetadata(() =>
        HttpResponse.json({ MediaContainer: { Metadata: [] } }),
      )

      expect(await lookup()).toEqual({ status: 'missing' })
    })

    it('reports an error on a 500 without retrying it', async () => {
      let hits = 0
      serveMetadata(() => {
        hits++
        return new HttpResponse(null, { status: 500 })
      })

      expect(await lookup()).toEqual({ status: 'error' })
      expect(hits).toBe(1)
    })

    it('reports an error when fetch throws on both attempts', async () => {
      serveMetadata(() => HttpResponse.error())

      expect(await lookup()).toEqual({ status: 'error' })
    })

    it('returns the item when it exists', async () => {
      serveMetadata(() =>
        HttpResponse.json({
          MediaContainer: { Metadata: [{ ratingKey: '123', title: 'Movie' }] },
        }),
      )

      expect(await lookup()).toEqual({
        status: 'found',
        metadata: { ratingKey: '123', title: 'Movie' },
      })
    })

    it('retries a timed-out read once and returns the item', async () => {
      vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(timedOutSignal())
      serveMetadata(() =>
        HttpResponse.json({
          MediaContainer: { Metadata: [{ ratingKey: '123', title: 'Movie' }] },
        }),
      )

      expect(await lookup()).toEqual({
        status: 'found',
        metadata: { ratingKey: '123', title: 'Movie' },
      })
    })

    it('reports an error when both attempts time out', async () => {
      let hits = 0
      vi.spyOn(AbortSignal, 'timeout')
        .mockReturnValueOnce(timedOutSignal())
        .mockReturnValueOnce(timedOutSignal())
      serveMetadata(() => {
        hits++
        return HttpResponse.json({
          MediaContainer: { Metadata: [{ ratingKey: '123', title: 'Movie' }] },
        })
      })

      expect(await lookup()).toEqual({ status: 'error' })
      expect(hits).toBe(0)
    })
  })
})
