import type { FastifyInstance } from 'fastify'
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

const SEEDED_TOKEN = 'test_plex_token_1234567890'
const FEEDS = {
  selfRss: 'https://rss.plex.tv/self-feed',
  friendsRss: 'https://rss.plex.tv/friends-feed',
}

describe('Config Plex token changes and watchlist feeds', () => {
  let app: FastifyInstance

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
  })

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
})
