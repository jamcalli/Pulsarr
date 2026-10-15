import {
  assertPlexTokensAccepted,
  PlexTokenCheckError,
} from '@services/plex-watchlist/api/token-check.js'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'
import { server } from '../../../../setup/msw-setup.js'

let pings: string[] = []

beforeEach(() => {
  pings = []
  server.use(
    http.get('https://plex.tv/api/v2/ping', ({ request }) => {
      const token = request.headers.get('X-Plex-Token') ?? ''
      pings.push(token)
      if (token === 'bad') return new HttpResponse(null, { status: 401 })
      if (token === 'down') return HttpResponse.error()
      return HttpResponse.json({ pong: true })
    }),
  )
})

function check(plexTokens: string[] | undefined, current = ['saved']) {
  return assertPlexTokensAccepted({ plexTokens }, current, createMockLogger())
}

describe('assertPlexTokensAccepted', () => {
  it('accepts a new token plex.tv accepts', async () => {
    await expect(check(['good'])).resolves.toBeUndefined()
    expect(pings).toEqual(['good'])
  })

  it.each([
    ['bad', 'rejected'],
    ['down', 'unreachable'],
  ])('refuses %s as %s', async (token, result) => {
    await expect(check([token])).rejects.toMatchObject({
      name: 'PlexTokenCheckError',
      result,
    })
  })

  it('skips the check when the tokens do not change or are removed', async () => {
    await check(undefined)
    await check(['saved'])
    await check([])

    expect(pings).toEqual([])
  })

  it('checks the first token linked on a fresh install', async () => {
    await expect(check(['good'], [])).resolves.toBeUndefined()
    await expect(check(['bad'], [])).rejects.toMatchObject({
      result: 'rejected',
    })
    expect(pings).toEqual(['good', 'bad'])
  })

  it('throws the typed error', async () => {
    await expect(check(['bad'])).rejects.toBeInstanceOf(PlexTokenCheckError)
  })
})
