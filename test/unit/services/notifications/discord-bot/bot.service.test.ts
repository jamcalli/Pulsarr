import { DiscordBotService } from '@services/notifications/discord-bot/bot.service.js'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const discord = vi.hoisted(() => ({
  clients: 0,
  registrations: [] as Array<() => void>,
}))

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>()
  class FakeClient {
    constructor() {
      discord.clients += 1
    }
    once() {}
    on() {}
    async login() {
      return 'token'
    }
    async destroy() {}
  }
  class FakeREST {
    setToken() {
      return this
    }
    put() {
      return new Promise<void>((resolve) => {
        discord.registrations.push(resolve)
      })
    }
  }
  return { ...actual, Client: FakeClient, REST: FakeREST }
})

function createService() {
  const fastify = {
    config: { discordBotToken: 'bot-token', discordClientId: 'client-id' },
    db: {},
    approvalService: {},
  } as unknown as FastifyInstance
  return new DiscordBotService(createMockLogger(), fastify)
}

describe('DiscordBotService.startBot', () => {
  beforeEach(() => {
    discord.clients = 0
    discord.registrations.length = 0
  })

  it('two concurrent starts construct one Discord client', async () => {
    const service = createService()

    const starts = [service.startBot(), service.startBot()]
    for (const resolve of discord.registrations) resolve()
    await Promise.all(starts)

    expect(discord.clients).toBe(1)
  })

  it('a stop during command registration cancels the pending start', async () => {
    const service = createService()

    const start = service.startBot()
    await vi.waitFor(() => expect(discord.registrations).toHaveLength(1))
    expect(await service.stopBot()).toBe(true)
    for (const resolve of discord.registrations) resolve()

    expect(await start).toBe(false)
    expect(discord.clients).toBe(0)
    expect(service.getBotStatus()).toBe('stopped')
  })
})
