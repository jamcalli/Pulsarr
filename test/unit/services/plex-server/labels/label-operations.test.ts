import {
  getCurrentLabels,
  removeSpecificLabels,
} from '@services/plex-server/labels/label-operations.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
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
})
