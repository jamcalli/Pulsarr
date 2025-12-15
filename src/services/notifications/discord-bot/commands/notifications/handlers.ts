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
  log: FastifyBaseLogger
}

// Database Operations
async function getUser(
  discordId: string,
  deps: HandlerDeps,
): Promise<User | null> {
  try {
    const users = await deps.db.getAllUsers()
    const user = users.find((u) => u.discord_id === discordId)
    deps.log.debug(
      { discordId, found: !!user },
      'Looking up user by Discord ID',
    )
    return user || null
  } catch (error) {
    deps.log.error({ error, discordId }, 'Error getting user')
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
    deps.log.debug({ userId, updateData }, 'User updated successfully')
    return true
  } catch (error) {
    deps.log.error({ error, userId, updateData }, 'Error updating user')
    return false
  }
}

/**
 * Handles button interactions for the notifications settings UI.
 *
 * Responds to button presses for toggling Discord, Apprise, and Tautulli notifications,
 * editing the user profile, and closing the settings form.
 */
export async function handleNotificationButtons(
  interaction: ButtonInteraction,
  deps: HandlerDeps,
): Promise<void> {
  const { log } = deps
  const cache = SettingsCache.getInstance()

  // Check if this is a dynamic retry button (they start with retryPlexLink_)
  if (interaction.customId.startsWith('retryPlexLink_')) {
    // This is now handled by the collector in the modal handler
    return
  }

  if (!cache.has(interaction.user.id)) {
    log.debug(
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
    log.debug(
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
      log.info(
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
      }
      break
    }

    case 'toggleApprise': {
      await interaction.deferUpdate()
      const appriseUpdated = await updateUser(
        user.id,
        { notify_apprise: !user.notify_apprise },
        deps,
      )
      if (appriseUpdated) {
        const updatedUser = await getUser(interaction.user.id, deps)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, deps)
        }
      }
      break
    }

    case 'toggleTautulli': {
      await interaction.deferUpdate()
      const newTautulliState = !user.notify_tautulli
      log.info(
        { userId: user.id, enabled: newTautulliState },
        'Updating Tautulli notification preference',
      )
      const tautulliUpdated = await updateUser(
        user.id,
        { notify_tautulli: newTautulliState },
        deps,
      )
      if (tautulliUpdated) {
        const updatedUser = await getUser(interaction.user.id, deps)
        if (updatedUser) {
          await showSettingsForm(interaction, updatedUser, deps)
        }
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
      log.debug({ userId: interaction.user.id }, 'Settings session closed')
      break
    }
  }
}
