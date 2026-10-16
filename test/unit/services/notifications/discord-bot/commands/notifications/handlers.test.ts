import type { DatabaseService } from '@services/database.service.js'
import { handleNotificationButtons } from '@services/notifications/discord-bot/commands/notifications/handlers.js'
import type { ButtonInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../../../mocks/logger.js'

describe('handleNotificationButtons', () => {
  it('a retryPlexLink_ click opens the Plex link modal', async () => {
    const interaction = {
      customId: 'retryPlexLink_1760000000000',
      user: { id: '333333333333333333' },
      showModal: vi.fn(async () => {}),
      reply: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      deferUpdate: vi.fn(async () => {}),
    }
    const db = { getUserByDiscordId: vi.fn(async () => undefined) }

    await handleNotificationButtons(
      interaction as unknown as ButtonInteraction,
      { db: db as unknown as DatabaseService, logger: createMockLogger() },
    )

    expect(interaction.showModal).toHaveBeenCalledTimes(1)
  })
})
