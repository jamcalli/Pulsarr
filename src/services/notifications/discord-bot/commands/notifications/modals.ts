/**
 * Notifications Command Modals
 *
 * Modal builders and submission handlers for the notifications command.
 */

import type { User } from '@root/types/config.types.js'
import type { DatabaseService } from '@services/database.service.js'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { MessageFlags } from 'discord-api-types/v10'
import type { FastifyBaseLogger } from 'fastify'
import { SettingsCache } from './cache.js'
import { createActionRows, createNotificationsEmbed } from './settings-form.js'

export interface ModalDeps {
  db: DatabaseService
  log: FastifyBaseLogger
}

/**
 * Creates a modal dialog prompting the user to enter their Plex username.
 */
export function createPlexLinkModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('plexUsernameModal')
    .setTitle('Link Plex Account')
  const usernameInput = new TextInputBuilder()
    .setCustomId('plexUsername')
    .setLabel('Enter your Plex username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Your Plex username')
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput),
  )
  return modal
}

/**
 * Creates a modal dialog for editing user profile settings.
 */
export function createProfileEditModal(user: User): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId('editProfileModal')
    .setTitle('Edit Profile')

  const aliasInput = new TextInputBuilder()
    .setCustomId('alias')
    .setLabel('Display Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(user.alias || '')
    .setPlaceholder('Enter a display name')

  const appriseInput = new TextInputBuilder()
    .setCustomId('apprise')
    .setLabel('Apprise URL')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder('Enter your Apprise URL')

  if (user.apprise) {
    appriseInput.setValue(user.apprise)
  }

  // Add components to modal
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(aliasInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(appriseInput),
  )

  return modal
}

// Database Operations
async function getUser(
  discordId: string,
  deps: ModalDeps,
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
  deps: ModalDeps,
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
 * Handles the submission of the Plex username modal to link a Discord user with a Plex account.
 */
export async function handlePlexUsernameModal(
  interaction: ModalSubmitInteraction,
  deps: ModalDeps,
): Promise<void> {
  const { db, log } = deps
  const plexUsername = interaction.fields
    .getTextInputValue('plexUsername')
    .trim()

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    log.info(
      { userId: interaction.user.id },
      'Attempting to link Discord account with Plex',
    )
    const users = await db.getAllUsers()
    const matchingUser = users.find(
      (u) => u.name.toLowerCase() === plexUsername.toLowerCase(),
    )

    if (!matchingUser) {
      log.warn(
        { plexUsername, userId: interaction.user.id },
        'Failed to find matching Plex account',
      )
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Account Link Failed')
        .setColor(0xff0000)
        .setDescription('Unable to find a Plex account with that username.')
        .addFields({
          name: 'What to do next',
          value:
            'Please ensure:\n• Your Plex username is spelled correctly\n• You have an active Plex account\n• Your account has been added to the server',
        })

      const retryId = `retryPlexLink_${Date.now()}`

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(retryId)
              .setLabel('Try Again')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      })

      if (interaction.channel) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) =>
            i.customId === retryId && i.user.id === interaction.user.id,
          time: 15 * 60 * 1000, // 15 minute timeout
          max: 1, // Collect only one interaction
        })

        collector.on('collect', async (buttonInteraction) => {
          try {
            await interaction.deleteReply()
            await buttonInteraction.showModal(createPlexLinkModal())
          } catch (error) {
            log.error(
              { error, userId: buttonInteraction.user.id },
              'Error handling retry button',
            )
            await buttonInteraction.reply({
              content:
                'An error occurred. Please try the /notifications command again.',
              flags: MessageFlags.Ephemeral,
            })
          }
        })
      }

      return
    }

    if (
      matchingUser.discord_id &&
      matchingUser.discord_id !== interaction.user.id
    ) {
      log.warn(
        {
          plexUsername,
          userId: interaction.user.id,
          existingDiscordId: matchingUser.discord_id,
        },
        'Plex account already linked to another Discord user',
      )

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Account Link Failed')
        .setColor(0xff0000)
        .setDescription(
          'This Plex account is already linked to another Discord user.',
        )
        .addFields({
          name: 'What to do next',
          value:
            'Please ensure:\n• You are using your own Plex username\n• Contact an administrator if you believe this is an error',
        })

      const retryId = `retryPlexLink_${Date.now()}`

      await interaction.editReply({
        embeds: [errorEmbed],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(retryId)
              .setLabel('Try Different Username')
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      })

      if (interaction.channel) {
        const collector = interaction.channel.createMessageComponentCollector({
          filter: (i) =>
            i.customId === retryId && i.user.id === interaction.user.id,
          time: 15 * 60 * 1000, // 15 minute timeout
          max: 1, // Collect only one interaction
        })

        collector.on('collect', async (buttonInteraction) => {
          try {
            await interaction.deleteReply()
            await buttonInteraction.showModal(createPlexLinkModal())
          } catch (error) {
            log.error(
              { error, userId: buttonInteraction.user.id },
              'Error handling retry button',
            )
            await buttonInteraction.reply({
              content:
                'An error occurred. Please try the /notifications command again.',
              flags: MessageFlags.Ephemeral,
            })
          }
        })
      }

      return
    }

    log.info(
      { plexUsername, userId: interaction.user.id },
      'Successfully linked Discord account to Plex user',
    )

    await updateUser(matchingUser.id, { discord_id: interaction.user.id }, deps)
    const updatedUser = await getUser(interaction.user.id, deps)

    if (updatedUser) {
      const cache = SettingsCache.getInstance()
      cache.set(interaction.user.id, interaction.id)

      const messagePayload = {
        embeds: [createNotificationsEmbed(updatedUser)],
        components: createActionRows(updatedUser),
      }
      await interaction.editReply(messagePayload)
    }
  } catch (error) {
    log.error(
      { error, plexUsername, userId: interaction.user.id },
      'Error processing Plex username',
    )
    await interaction.editReply({
      content: 'An error occurred while processing your request.',
    })
  }
}

/**
 * Handles submission of the profile edit modal, updating the user's alias and Apprise URL.
 */
export async function handleProfileEditModal(
  interaction: ModalSubmitInteraction,
  deps: ModalDeps,
): Promise<void> {
  const { log } = deps
  const alias = interaction.fields.getTextInputValue('alias')
  const apprise = interaction.fields.getTextInputValue('apprise')

  log.info({ userId: interaction.user.id }, 'Processing profile update request')

  try {
    const user = await getUser(interaction.user.id, deps)
    if (!user) {
      log.warn(
        { userId: interaction.user.id },
        'Attempted to edit profile for non-existent user',
      )
      await interaction.reply({
        content:
          'Unable to find your user profile. Please try using /notifications again.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    log.debug({ userId: user.id, alias, apprise }, 'Updating user profile')

    await interaction.deferUpdate()

    const updated = await updateUser(
      user.id,
      {
        alias: alias || null,
        apprise: apprise || null,
      },
      deps,
    )

    if (updated) {
      const updatedUser = await getUser(interaction.user.id, deps)
      if (updatedUser) {
        const messagePayload = {
          embeds: [createNotificationsEmbed(updatedUser)],
          components: createActionRows(updatedUser),
        }
        await interaction.editReply(messagePayload)
        log.debug({ userId: updatedUser.id }, 'Profile settings form updated')
        return
      }
    }

    log.error(
      { userId: user.id },
      'Failed to update or retrieve user after profile edit',
    )
    await interaction.followUp({
      content: 'An error occurred while updating your profile.',
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    log.error(
      { error, userId: interaction.user.id },
      'Error in profile edit modal handler',
    )
    await interaction.followUp({
      content: 'An error occurred while processing your request.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
