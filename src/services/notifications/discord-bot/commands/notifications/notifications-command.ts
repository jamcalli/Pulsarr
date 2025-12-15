/**
 * Notifications Command Entry Point
 *
 * Slash command definition for /notifications.
 * Allows users to configure their notification preferences.
 */

import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import { SlashCommandBuilder } from 'discord.js'
import { MessageFlags } from 'discord-api-types/v10'
import type { FastifyBaseLogger } from 'fastify'
import { createPlexLinkModal } from './modals.js'
import { showSettingsForm } from './settings-form.js'

export interface NotificationCommandDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

// Database Operations
async function getUser(
  discordId: string,
  deps: NotificationCommandDeps,
): Promise<User | null> {
  try {
    const user = await deps.db.getUserByDiscordId(discordId)
    deps.log.debug(
      { discordId, found: !!user },
      'Looking up user by Discord ID',
    )
    return user ?? null
  } catch (error) {
    deps.log.error({ error, discordId }, 'Error getting user')
    return null
  }
}

export const notificationsCommand = {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Configure your notification preferences'),

  async execute(
    interaction: ChatInputCommandInteraction,
    deps: NotificationCommandDeps,
  ): Promise<void> {
    const { log } = deps

    log.info(
      { userId: interaction.user.id },
      'User accessed notification settings',
    )
    try {
      const user = await getUser(interaction.user.id, deps)

      if (!user) {
        log.debug(
          { userId: interaction.user.id },
          'No linked user found, showing Plex link modal',
        )
        await interaction.showModal(createPlexLinkModal())
        return
      }

      await showSettingsForm(interaction, user, deps)
    } catch (error) {
      log.error(
        { error, userId: interaction.user.id },
        'Error in notifications command',
      )
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral,
      })
    }
  },
}

// Re-export handlers for the event router
export { handleNotificationButtons } from './handlers.js'
export {
  handlePlexUsernameModal,
  handleProfileEditModal,
} from './modals.js'
