/**
 * Notifications Command Handlers
 *
 * Button interaction handlers for the notifications settings UI.
 */

import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import type { ButtonInteraction } from 'discord.js'
import { MessageFlags } from 'discord-api-types/v10'
import type { FastifyBaseLogger } from 'fastify'
import { SettingsCache } from './cache.js'
import { createPlexLinkModal, createProfileEditModal } from './modals.js'
import { showSettingsForm } from './settings-form.js'

export interface HandlerDeps {
  db: DatabaseService
  logger: FastifyBaseLogger
}

// Database Operations
async function getUser(
  discordId: string,
  deps: HandlerDeps,
): Promise<User | null> {
  try {
    const user = await deps.db.getUserByDiscordId(discordId)
    deps.logger.debug(
      { discordId, found: !!user },
      'Looking up user by Discord ID',
    )
    return user ?? null
  } catch (error) {
    deps.logger.error({ error, discordId }, 'Error getting user')
    return null
  }
}

async function updateUser(
  userId: number,
  updateData: Partial<User>,
  deps: HandlerDeps,
): Promise<boolean> {
  try {
    await deps.db.updateUser(userId, updateData)
    deps.logger.debug({ userId, updateData }, 'User updated successfully')
    return true
  } catch (error) {
    deps.logger.error({ error, userId, updateData }, 'Error updating user')
    return false
  }
}

/**
 * Handles button interactions for the notifications settings UI.
 *
 * Responds to button presses for toggling Discord, Apprise, and Plex Mobile notifications,
 * editing the user profile, and closing the settings form.
 */
export async function handleNotificationButtons(
  interaction: ButtonInteraction,
  deps: HandlerDeps,
): Promise<void> {
  const { logger } = deps
  const cache = SettingsCache.getInstance()

  // Check if this is a dynamic retry button (they start with retryPlexLink_)
  if (interaction.customId.startsWith('retryPlexLink_')) {
    // This is now handled by the collector in the modal handler
    return
  }

  if (!cache.has(interaction.user.id)) {
    logger.debug(
      { userId: interaction.user.id },
      'Session expired, requiring new command',
    )
    await interaction.reply({
      content:
        'Your session has expired. Please use /notifications to start a new session.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const user = await getUser(interaction.user.id, deps)
  if (!user) {
    logger.debug(
      { userId: interaction.user.id },
      'No user found, showing Plex link modal',
    )
    await interaction.showModal(createPlexLinkModal())
    return
  }

  switch (interaction.customId) {
    case 'toggleDiscord': {
      await interaction.deferUpdate()
      const newDiscordState = !user.notify_discord
      logger.info(
        { userId: user.id, enabled: newDiscordState },
        'Updating Discord notification preference',
      )
      const discordUpdated = await updateUser(
        user.id,
        { notify_discord: newDiscordState },
        deps,
      )
      if (discordUpdated) {
        const updatedUser = await getUser(interaction.user.id, deps)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, deps)
        }
      } else {
        await interaction.followUp({
          content:
            '❌ Failed to update notification preference. Please try again.',
          flags: MessageFlags.Ephemeral,
        })
      }
      break
    }

    case 'toggleApprise': {
      await interaction.deferUpdate()
      const newAppriseState = !user.notify_apprise
      logger.info(
        { userId: user.id, enabled: newAppriseState },
        'Updating Apprise notification preference',
      )
      const appriseUpdated = await updateUser(
        user.id,
        { notify_apprise: newAppriseState },
        deps,
      )
      if (appriseUpdated) {
        const updatedUser = await getUser(interaction.user.id, deps)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, deps)
        }
      } else {
        await interaction.followUp({
          content:
            '❌ Failed to update notification preference. Please try again.',
          flags: MessageFlags.Ephemeral,
        })
      }
      break
    }

    case 'togglePlexMobile': {
      await interaction.deferUpdate()
      const newPlexMobileState = !user.notify_plex_mobile
      logger.info(
        { userId: user.id, enabled: newPlexMobileState },
        'Updating Plex Mobile notification preference',
      )
      const plexMobileUpdated = await updateUser(
        user.id,
        { notify_plex_mobile: newPlexMobileState },
        deps,
      )
      if (plexMobileUpdated) {
        const updatedUser = await getUser(interaction.user.id, deps)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, deps)
        }
      } else {
        await interaction.followUp({
          content:
            '❌ Failed to update notification preference. Please try again.',
          flags: MessageFlags.Ephemeral,
        })
      }
      break
    }

    case 'toggleMentions': {
      await interaction.deferUpdate()
      const newMentionsState = !user.notify_discord_mention
      logger.info(
        { userId: user.id, enabled: newMentionsState },
        'Updating Discord mention preference',
      )
      const mentionsUpdated = await updateUser(
        user.id,
        { notify_discord_mention: newMentionsState },
        deps,
      )
      if (mentionsUpdated) {
        const updatedUser = await getUser(interaction.user.id, deps)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, deps)
        }
      } else {
        await interaction.followUp({
          content: '❌ Failed to update mention preference. Please try again.',
          flags: MessageFlags.Ephemeral,
        })
      }
      break
    }

    case 'editProfile': {
      await interaction.showModal(createProfileEditModal(user))
      break
    }

    case 'closeSettings': {
      await interaction.update({
        content: 'Settings saved. Happy watching!',
        embeds: [],
        components: [],
      })
      cache.delete(interaction.user.id)
      logger.debug({ userId: interaction.user.id }, 'Settings session closed')
      break
    }

    default:
      logger.warn(
        { customId: interaction.customId },
        'Unhandled button interaction',
      )
  }
}
