import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from '../../helpers/app.js'

describe('caches plugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await build()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('clears the arr caches both managers created on it', () => {
    const tagCaches = [
      // biome-ignore lint/complexity/useLiteralKeys: dot access to a protected member does not compile
      app.sonarrManager['caches'].tags.entries,
      // biome-ignore lint/complexity/useLiteralKeys: dot access to a protected member does not compile
      app.radarrManager['caches'].tags.entries,
    ]
    for (const tags of tagCaches) tags.set(1, [{ id: 1, label: 'a' }])

    app.caches.clear()

    for (const tags of tagCaches) expect(tags.has(1)).toBe(false)
  })
})
