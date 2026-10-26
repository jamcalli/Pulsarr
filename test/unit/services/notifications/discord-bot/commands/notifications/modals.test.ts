import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import { handlePlexUsernameModal } from '@services/notifications/discord-bot/commands/notifications/modals.js'
import type { ModalSubmitInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { createMockLogger } from '../../../../../../mocks/logger.js'
import { createMockUser } from '../../../../../../mocks/user.js'

const DISCORD_ID = '333333333333333333'

const PRIMARY = createMockUser(1, 'owner', { is_primary_token: true })
const FRIEND = createMockUser(2, 'friend')

function fakeDb(users: User[]) {
  const linked = new Map<string, User>()
  const db = {
    getAllUsers: vi.fn(async () => users),
    updateUser: vi.fn(async (userId: number, data: Partial<User>) => {
      const user = users.find((u) => u.id === userId)
      if (user && data.discord_id) {
        linked.set(data.discord_id, { ...user, ...data })
      }
      return true
    }),
    getUserByDiscordId: vi.fn(async (discordId: string) =>
      linked.get(discordId),
    ),
  }
  return db
}

interface LinkReply {
  components?: Array<{
    toJSON: () => { components: Array<{ custom_id?: string }> }
  }>
}

function fakeModal(plexUsername: string) {
  return {
    id: 'interaction-1',
    user: { id: DISCORD_ID },
    channel: null,
    fields: { getTextInputValue: vi.fn(() => plexUsername) },
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async (_reply: LinkReply) => {}),
  }
}

async function submit(plexUsername: string, users: User[]) {
  const db = fakeDb(users)
  const interaction = fakeModal(plexUsername)
  await handlePlexUsernameModal(
    interaction as unknown as ModalSubmitInteraction,
    { db: db as unknown as DatabaseService, logger: createMockLogger() },
  )
  return { db, interaction }
}

describe('handlePlexUsernameModal', () => {
  it('links an unlinked friend to the submitting Discord user', async () => {
    const { db, interaction } = await submit('Friend', [PRIMARY, FRIEND])

    expect(db.updateUser).toHaveBeenCalledWith(FRIEND.id, {
      discord_id: DISCORD_ID,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [expect.any(Object)] }),
    )
  })

  it('offers a retryPlexLink_ button when no Plex user matches', async () => {
    const { db, interaction } = await submit('stranger', [PRIMARY, FRIEND])

    expect(db.updateUser).not.toHaveBeenCalled()
    const [reply] = interaction.editReply.mock.calls[0]
    expect(reply.components?.[0].toJSON().components[0].custom_id).toMatch(
      /^retryPlexLink_\d+$/,
    )
  })

  it('refuses to link the primary user and leaves discord_id unset', async () => {
    const { db } = await submit('owner', [PRIMARY, FRIEND])

    expect(db.updateUser).not.toHaveBeenCalled()
  })
})
