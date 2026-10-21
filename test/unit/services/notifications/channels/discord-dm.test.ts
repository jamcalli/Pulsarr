import {
  type DiscordDmDeps,
  sendNotification,
  testNotification,
} from '@services/notifications/channels/discord-dm.js'
import { type Client, DiscordAPIError } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../mocks/logger.js'

const DISCORD_ID = '123456789012345678'

function fakeClient(send: () => Promise<void>) {
  const user = { username: 'alice', send: vi.fn(send) }
  const fetch = vi.fn(async () => user)
  const client = { users: { fetch } } as unknown as Client
  return { client, fetch, send: user.send }
}

function deps(
  client: Client | null,
  botStatus: DiscordDmDeps['botStatus'] = 'running',
): DiscordDmDeps {
  return { logger: createMockLogger(), botClient: client, botStatus }
}

describe('discord DM testNotification', () => {
  it('DMs a test embed to the given Discord user', async () => {
    const { client, fetch, send } = fakeClient(async () => {})

    const result = await testNotification(DISCORD_ID, deps(client))

    expect(result).toEqual({ success: true })
    expect(fetch).toHaveBeenCalledWith(DISCORD_ID)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [expect.any(Object)] }),
    )
  })

  it.each(['stopped', 'starting', 'stopping'] as const)(
    'fails without sending while the bot is %s',
    async (status) => {
      const { client, fetch } = fakeClient(async () => {})

      const result = await testNotification(DISCORD_ID, deps(client, status))

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('fails when there is no bot client', async () => {
    const result = await testNotification(DISCORD_ID, deps(null))

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('reports a failure when Discord refuses the DM', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('Cannot send messages to this user')
    })

    const result = await testNotification(DISCORD_ID, deps(client))

    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('discord DM sendNotification', () => {
  const embed = { title: 'Nosferatu' }
  const message = { embed }

  it('DMs the message and reports delivery with the Discord handle', async () => {
    const { client, send } = fakeClient(async () => {})

    const result = await sendNotification(DISCORD_ID, message, deps(client))

    expect(result).toEqual({ ok: true, handle: 'alice' })
    expect(send).toHaveBeenCalledWith({ embeds: [embed] })
  })

  it('reports the bot gate without fetching the user', async () => {
    const { client, fetch } = fakeClient(async () => {})

    const result = await sendNotification(
      DISCORD_ID,
      message,
      deps(client, 'stopped'),
    )

    expect(result).toEqual({ ok: false, reason: 'bot not running' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports the Discord error code and message', async () => {
    const { client } = fakeClient(async () => {
      throw new DiscordAPIError(
        { code: 50007, message: 'Cannot send messages to this user' },
        50007,
        403,
        'POST',
        '/channels/1/messages',
        {},
      )
    })

    const result = await sendNotification(DISCORD_ID, message, deps(client))

    expect(result).toEqual({
      ok: false,
      reason: '50007 Cannot send messages to this user',
    })
  })
})
