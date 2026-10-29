import type { FastifyInstance } from 'fastify'
import { HttpResponse, http } from 'msw'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build } from '../../helpers/app.js'
import { getTestDatabase, resetDatabase } from '../../helpers/database.js'
import { seedAll } from '../../helpers/seeds/index.js'
import { server } from '../../setup/msw-setup.js'

const REJECTED_TOKEN = 'rejected-token'
const UNREACHABLE_TOKEN = 'unreachable-token'
const SEEDED_TOKEN = 'test_plex_token_1234567890'
const FEEDS = {
  selfRss: 'https://rss.plex.tv/self-feed',
  friendsRss: 'https://rss.plex.tv/friends-feed',
}

describe('Config Plex token changes and watchlist feeds', () => {
  let app: FastifyInstance
  let pings: string[] = []

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await resetDatabase()
    await seedAll(getTestDatabase())
    app.config.authenticationMethod = 'disabled'
    vi.spyOn(app.plexServerService, 'connectSSE').mockResolvedValue(undefined)
    vi.spyOn(app.plexServerService, 'disconnectSSE').mockReturnValue(undefined)
    await getTestDatabase()('configs').where({ id: 1 }).update(FEEDS)
    pings = []
    server.use(
      http.get('https://plex.tv/api/v2/ping', ({ request }) => {
        const token = request.headers.get('X-Plex-Token') ?? ''
        pings.push(token)
        if (token === REJECTED_TOKEN) {
          return new HttpResponse(null, { status: 401 })
        }
        if (token === UNREACHABLE_TOKEN) return HttpResponse.error()
        return HttpResponse.json({ pong: true })
      }),
    )
  })

  async function savedTokens() {
    const row = await getTestDatabase()('configs').where({ id: 1 }).first()
    return JSON.parse(row?.plexTokens ?? '[]')
  }

  async function savedFeeds() {
    const row = await getTestDatabase()('configs').where({ id: 1 }).first()
    return { selfRss: row?.selfRss, friendsRss: row?.friendsRss }
  }

  function putConfig(payload: Record<string, unknown>) {
    return app.inject({ method: 'PUT', url: '/v1/config', payload })
  }

  it('clears both feeds when the token changes', async () => {
    const res = await putConfig({ plexTokens: ['another-account-token'] })

    expect(res.statusCode).toBe(200)
    expect(await savedFeeds()).toEqual({ selfRss: '', friendsRss: '' })
    expect(app.config.selfRss).toBe('')
    expect(app.config.friendsRss).toBe('')
  })

  it('clears both feeds when the token is removed', async () => {
    const res = await putConfig({ plexTokens: [] })

    expect(res.statusCode).toBe(200)
    expect(await savedFeeds()).toEqual({ selfRss: '', friendsRss: '' })
  })

  it('keeps the feeds when an update leaves the token out', async () => {
    const res = await putConfig({ skipIfExistsOnPlex: true })

    expect(res.statusCode).toBe(200)
    expect(await savedFeeds()).toEqual(FEEDS)
  })

  it('saves which servers the existence check covers', async () => {
    const before = await app.inject({ method: 'GET', url: '/v1/config' })
    expect(before.json().config.plexExistenceScope).toBe('owned-and-shared')

    const res = await putConfig({ plexExistenceScope: 'owned' })

    expect(res.statusCode).toBe(200)
    const after = await app.inject({ method: 'GET', url: '/v1/config' })
    expect(after.json().config.plexExistenceScope).toBe('owned')
    expect(app.config.plexExistenceScope).toBe('owned')
  })

  it('refuses an unknown existence check scope', async () => {
    const res = await putConfig({ plexExistenceScope: 'everyone' })

    expect(res.statusCode).toBe(400)
  })

  it('keeps the feeds when the same token is saved again', async () => {
    const res = await putConfig({ plexTokens: [SEEDED_TOKEN] })

    expect(res.statusCode).toBe(200)
    expect(await savedFeeds()).toEqual(FEEDS)
  })

  it('keeps feeds the same update sets alongside a new token', async () => {
    const restored = {
      selfRss: 'https://rss.plex.tv/restored-self',
      friendsRss: 'https://rss.plex.tv/restored-friends',
    }
    const res = await putConfig({ plexTokens: ['restored-token'], ...restored })

    expect(res.statusCode).toBe(200)
    expect(await savedFeeds()).toEqual(restored)
  })

  it('keeps Plex Pass when only the server address changes', async () => {
    app.plexServerService.setHasPlexPass(true)

    const res = await putConfig({ plexServerUrl: 'http://10.0.0.2:32400' })

    expect(res.statusCode).toBe(200)
    expect(app.plexServerService.getHasPlexPass()).toBe(true)
  })

  it('forgets Plex Pass when the token changes', async () => {
    app.plexServerService.setHasPlexPass(true)

    const res = await putConfig({ plexTokens: ['another-account-token'] })

    expect(res.statusCode).toBe(200)
    expect(app.plexServerService.getHasPlexPass()).toBeNull()
  })

  it('refuses a token plex.tv rejects and changes nothing', async () => {
    app.plexServerService.setHasPlexPass(true)

    const res = await putConfig({ plexTokens: [REJECTED_TOKEN] })

    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      message: 'Plex did not accept the token',
    })
    expect(await savedTokens()).toEqual([SEEDED_TOKEN])
    expect(await savedFeeds()).toEqual(FEEDS)
    expect(app.plexServerService.getHasPlexPass()).toBe(true)
  })

  it('refuses a token when plex.tv cannot be reached', async () => {
    const res = await putConfig({ plexTokens: [UNREACHABLE_TOKEN] })

    expect(res.statusCode).toBe(502)
    expect(await savedTokens()).toEqual([SEEDED_TOKEN])
  })

  it('checks only tokens that change', async () => {
    await putConfig({ plexTokens: [SEEDED_TOKEN] })
    await putConfig({ plexTokens: [] })
    await putConfig({ plexTokens: ['another-account-token'] })

    expect(pings).toEqual(['another-account-token'])
  })
})
