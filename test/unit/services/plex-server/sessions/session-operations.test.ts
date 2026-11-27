import { getActiveSessions } from '@services/plex-server/sessions/session-operations.js'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

const SERVER_URL = 'http://plex.test'
const SESSIONS_URL = `${SERVER_URL}/status/sessions`

const fetchSessions = (token = 'token') =>
  getActiveSessions(SERVER_URL, token, createMockLogger())

describe('getActiveSessions', () => {
  it('returns the sessions Plex reports', async () => {
    const session = { sessionKey: '1', title: 'Episode' }
    server.use(
      http.get(SESSIONS_URL, () =>
        HttpResponse.json({ MediaContainer: { Metadata: [session] } }),
      ),
    )

    expect(await fetchSessions()).toEqual([session])
  })

  it('returns an empty list when nobody is watching', async () => {
    server.use(
      http.get(SESSIONS_URL, () => HttpResponse.json({ MediaContainer: {} })),
    )

    expect(await fetchSessions()).toEqual([])
  })

  it('throws when Plex answers with an error', async () => {
    server.use(
      http.get(SESSIONS_URL, () => new HttpResponse(null, { status: 503 })),
    )

    await expect(fetchSessions()).rejects.toThrow('503')
  })

  it('throws when Plex cannot be reached', async () => {
    server.use(http.get(SESSIONS_URL, () => HttpResponse.error()))

    await expect(fetchSessions()).rejects.toThrow()
  })

  it('returns an empty list without calling Plex when there is no token', async () => {
    let hits = 0
    server.use(
      http.get(SESSIONS_URL, () => {
        hits++
        return HttpResponse.json({ MediaContainer: {} })
      }),
    )

    expect(await fetchSessions('')).toEqual([])
    expect(hits).toBe(0)
  })
})
