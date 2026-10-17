import type { Config, User } from '@root/types/config.types.js'
import type { NotificationTestResult } from '@root/types/notification.types.js'
import {
  type TestSendDeps,
  testSystemTarget,
  testUserChannel,
} from '@services/notifications/orchestration/test-send.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockUser } from '../../../../mocks/user.js'

const OK: NotificationTestResult = { success: true, responseTime: 5 }

function failure(error: string): NotificationTestResult {
  return { success: false, error, statusCode: 404, responseTime: 5 }
}

function createDeps(config: Partial<Config> = {}, user?: User) {
  const fakes = {
    getUser: vi.fn(async () => user),
    testApprise: vi.fn(async (_url: string) => OK),
    testDiscordWebhook: vi.fn(async (_url: string) => OK),
    testDiscordDm: vi.fn(async (_discordId: string) => OK),
    testPlexMobile: vi.fn(async (_user: User) => OK),
  }
  const deps = {
    config: {
      systemAppriseUrl: '',
      discordWebhookUrl: '',
      publicContentNotifications: { enabled: false },
      ...config,
    },
    db: { getUser: fakes.getUser },
    apprise: { testNotification: fakes.testApprise },
    discordWebhook: { testNotification: fakes.testDiscordWebhook },
    discordBot: { testNotification: fakes.testDiscordDm },
    plexMobile: { testNotification: fakes.testPlexMobile },
  } as unknown as TestSendDeps
  return { deps, ...fakes }
}

describe('testSystemTarget', () => {
  it('is not configured when the setting is empty', async () => {
    const fake = createDeps()

    const outcome = await testSystemTarget('adminWebhook', fake.deps)

    expect(outcome.status).toBe('not_configured')
    expect(fake.testDiscordWebhook).not.toHaveBeenCalled()
  })

  it('passes a single URL result through unchanged', async () => {
    const fake = createDeps({ discordWebhookUrl: 'https://discord.com/a' })
    fake.testDiscordWebhook.mockResolvedValue(failure('gone'))

    const outcome = await testSystemTarget('adminWebhook', fake.deps)

    expect(outcome).toEqual({ status: 'sent', result: failure('gone') })
  })

  it('routes Apprise settings to the Apprise test', async () => {
    const fake = createDeps({ systemAppriseUrl: 'tgram://bot/chat' })

    const outcome = await testSystemTarget('systemApprise', fake.deps)

    expect(outcome.status).toBe('sent')
    expect(fake.testApprise).toHaveBeenCalledWith('tgram://bot/chat')
    expect(fake.testDiscordWebhook).not.toHaveBeenCalled()
  })

  it('reads the exact public field without falling back to the generic one', async () => {
    const fake = createDeps({
      publicContentNotifications: {
        enabled: true,
        discordWebhookUrls: 'https://discord.com/generic',
      },
    })

    const outcome = await testSystemTarget('publicDiscordMovies', fake.deps)

    expect(outcome.status).toBe('not_configured')
  })

  it('succeeds only when every URL in the list succeeds', async () => {
    const fake = createDeps({
      publicContentNotifications: {
        enabled: true,
        appriseUrls: 'tgram://a, tgram://b',
      },
    })

    const outcome = await testSystemTarget('publicApprise', fake.deps)

    if (outcome.status !== 'sent') throw new Error('expected a send')
    expect(fake.testApprise).toHaveBeenCalledTimes(2)
    expect(outcome.result.success).toBe(true)
    expect(outcome.result.error).toBeUndefined()
  })

  it('names the failing URLs when part of the list fails', async () => {
    const fake = createDeps({
      publicContentNotifications: {
        enabled: true,
        discordWebhookUrlsShows:
          'https://discord.com/ok,https://discord.com/bad1,https://discord.com/bad2',
      },
    })
    fake.testDiscordWebhook.mockImplementation(async (url) =>
      url.endsWith('ok') ? OK : failure('rejected'),
    )

    const outcome = await testSystemTarget('publicDiscordShows', fake.deps)

    if (outcome.status !== 'sent') throw new Error('expected a send')
    expect(outcome.result.success).toBe(false)
    expect(outcome.result.statusCode).toBeUndefined()
    expect(outcome.result.error).toContain('https://discord.com/bad1')
    expect(outcome.result.error).toContain('https://discord.com/bad2')
    expect(outcome.result.error).not.toContain('https://discord.com/ok')
  })
})

describe('testUserChannel', () => {
  it('is not found for an unknown user', async () => {
    const outcome = await testUserChannel(99, 'apprise', createDeps().deps)

    expect(outcome.status).toBe('not_found')
  })

  it('is not configured when the user has no Apprise URL', async () => {
    const fake = createDeps({}, createMockUser(1, null, { apprise: null }))

    const outcome = await testUserChannel(1, 'apprise', fake.deps)

    expect(outcome.status).toBe('not_configured')
    expect(fake.testApprise).not.toHaveBeenCalled()
  })

  it('is not configured when the user has no Discord ID', async () => {
    const fake = createDeps({}, createMockUser(1, null, { discord_id: null }))

    const outcome = await testUserChannel(1, 'discord-dm', fake.deps)

    expect(outcome.status).toBe('not_configured')
    expect(fake.testDiscordDm).not.toHaveBeenCalled()
  })

  it('tests the saved Apprise URL', async () => {
    const fake = createDeps(
      {},
      createMockUser(1, null, { apprise: 'tgram://u' }),
    )

    const outcome = await testUserChannel(1, 'apprise', fake.deps)

    expect(outcome).toEqual({ status: 'sent', result: OK })
    expect(fake.testApprise).toHaveBeenCalledWith('tgram://u')
  })

  it('DMs the saved Discord ID', async () => {
    const fake = createDeps(
      {},
      createMockUser(1, null, { discord_id: '123456789012345678' }),
    )

    await testUserChannel(1, 'discord-dm', fake.deps)

    expect(fake.testDiscordDm).toHaveBeenCalledWith('123456789012345678')
  })

  it('tests Plex mobile for the user record', async () => {
    const user = createMockUser(1)
    const fake = createDeps({}, user)

    const outcome = await testUserChannel(user.id, 'plex-mobile', fake.deps)

    expect(outcome.status).toBe('sent')
    expect(fake.testPlexMobile).toHaveBeenCalledWith(user)
  })
})
