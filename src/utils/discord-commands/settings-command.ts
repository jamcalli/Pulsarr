import { 
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  MessageFlags as DiscordMessageFlags
} from 'discord.js';
import { MessageFlags } from 'discord-api-types/v10';
import type { FastifyInstance } from 'fastify';
import type { User } from '@root/types/config.types.js';
import type { DatabaseService } from '@root/services/database.service.js';

// Types
interface CommandContext {
  fastify: FastifyInstance;
}

// Utilities
const getDb = (fastify: FastifyInstance): DatabaseService => fastify.db;

class SettingsCache {
  private static instance: SettingsCache;
  private cache: Map<string, string> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  static getInstance(): SettingsCache {
    if (!SettingsCache.instance) {
      SettingsCache.instance = new SettingsCache();
    }
    return SettingsCache.instance;
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }

  set(userId: string, messageId: string): void {
    this.cache.set(userId, messageId);
  }

  get(userId: string): string | undefined {
    return this.cache.get(userId);
  }

  delete(userId: string): void {
    this.cache.delete(userId);
  }

  private cleanup(): void {
    this.cache.clear();
  }
}

// UI Components
class SettingsUI {
  static createEmbed(user: User): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('User Settings')
      .setColor(0x48a9a6)
      .setDescription('Configure your notification preferences and profile settings below.')
      .addFields([
        {
          name: 'Profile Information',
          value: [
            `**Plex Username**: ${user.name}`,
            `**Display Name**: ${user.alias || '*Not set*'}`,
            `**Email**: ${user.email || '*Not set*'}`
          ].join('\n'),
          inline: false
        },
        {
          name: 'Notification Settings',
          value: [
            `**Discord**: ${user.notify_discord ? '✅ Enabled' : '❌ Disabled'}`,
            `**Email**: ${user.notify_email ? '✅ Enabled' : '❌ Disabled'}`
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({ text: 'Use the buttons below to modify your settings' });
  }

  static createActionRow(user: User): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('editProfile')
        .setLabel('Edit Profile')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('toggleDiscord')
        .setLabel(user.notify_discord ? 'Disable Discord' : 'Enable Discord')
        .setStyle(user.notify_discord ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('toggleEmail')
        .setLabel(user.notify_email ? 'Disable Email' : 'Enable Email')
        .setStyle(user.notify_email ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('closeSettings')
        .setLabel('Exit')
        .setStyle(ButtonStyle.Danger)
    );
  }

  static createPlexLinkModal(): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId('plexUsernameModal')
      .setTitle('Link Plex Account');

    const usernameInput = new TextInputBuilder()
      .setCustomId('plexUsername')
      .setLabel('Enter your Plex username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Your Plex username');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(usernameInput)
    );

    return modal;
  }

  static createProfileEditModal(user: User): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId('editProfileModal')
      .setTitle('Edit Profile');

    const aliasInput = new TextInputBuilder()
      .setCustomId('alias')
      .setLabel('Display Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(user.alias || '')
      .setPlaceholder('Enter a display name');

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel('Email Address')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue(user.email || '')
      .setPlaceholder('Enter your email address');

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(aliasInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput)
    );

    return modal;
  }
}

// Core Functionality
class SettingsManager {
  private readonly cache = SettingsCache.getInstance();
  private readonly db: DatabaseService;

  constructor(private readonly context: CommandContext) {
    this.db = getDb(context.fastify);
  }

  async showSettingsForm(
    interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
    user: User
  ): Promise<void> {
    const messagePayload = {
      embeds: [SettingsUI.createEmbed(user)],
      components: [SettingsUI.createActionRow(user)]
    };

    try {
      if (!interaction.replied && !interaction.deferred) {
        const response = await interaction.reply({
          ...messagePayload,
          flags: DiscordMessageFlags.Ephemeral
        });
        this.cache.set(interaction.user.id, interaction.id);
      } else {
        await interaction.editReply(messagePayload);
      }
    } catch (error) {
      console.error('Error showing settings form:', error);
      if ('followUp' in interaction) {
        await interaction.followUp({
          content: 'An error occurred while displaying settings.',
          flags: DiscordMessageFlags.Ephemeral
        });
      }
    }
  }

  async handleSettingsUpdate(
    interaction: ButtonInteraction | ModalSubmitInteraction,
    updateData: Partial<User>
  ): Promise<void> {
    const user = await this.getUser(interaction.user.id);
    if (!user) return;

    try {
      await this.db.updateUser(user.id, updateData);
      const updatedUser = await this.getUser(interaction.user.id);
      if (updatedUser) {
        await this.showSettingsForm(interaction, updatedUser);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      await interaction.reply({
        content: 'An error occurred while updating your settings.',
        flags: DiscordMessageFlags.Ephemeral
      });
    }
  }

  async getUser(discordId: string): Promise<User | null> {
    const users = await this.db.getAllUsers();
    return users.find(u => u.discord_id === discordId) || null;
  }
}

// Command Handlers
export const settingsCommand = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View or modify your notification settings'),
  
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const settings = new SettingsManager(context);
    const user = await settings.getUser(interaction.user.id);

    if (!user) {
      await interaction.showModal(SettingsUI.createPlexLinkModal());
      return;
    }

    await settings.showSettingsForm(interaction, user);
  }
};

export async function handleSettingsButtons(interaction: ButtonInteraction, context: CommandContext) {
  const settings = new SettingsManager(context);
  const cache = SettingsCache.getInstance();
  if (!cache.has(interaction.user.id)) {
    await interaction.reply({
      content: 'Your settings session has expired. Please use /settings to start a new session.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }
  const user = await settings.getUser(interaction.user.id);
  if (!user) return;
  switch (interaction.customId) {
    case 'retryPlexLink':
      await interaction.showModal(SettingsUI.createPlexLinkModal());
      break;
    case 'toggleDiscord':
      await interaction.deferUpdate();
      await settings.handleSettingsUpdate(interaction, { 
        notify_discord: !user.notify_discord 
      });
      break;
    case 'toggleEmail':
      await interaction.deferUpdate();
      await settings.handleSettingsUpdate(interaction, { 
        notify_email: !user.notify_email 
      });
      break;
    case 'editProfile':
      await interaction.showModal(SettingsUI.createProfileEditModal(user));
      break;
      case 'closeSettings':
        await interaction.update({ 
          content: 'Thanks for using Pulsarr. Happy watching!',
          embeds: [],
          components: [],
        });
        cache.delete(interaction.user.id);
        break;
  }
}

export async function handlePlexUsernameModal(interaction: ModalSubmitInteraction, context: CommandContext) {
  const settings = new SettingsManager(context);
  const plexUsername = interaction.fields.getTextInputValue('plexUsername').trim();

  try {
    const existingUser = await settings.getUser(plexUsername);
    if (!existingUser) {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Account Link Failed')
        .setColor(0xFF0000)
        .setDescription('Unable to find a Plex account with that username.')
        .addFields(
          { name: 'What to do next', value: 'Please ensure:\n• Your Plex username is spelled correctly\n• You have an active Plex account\n• Your account has been added to the server' },
          { name: 'Try Again', value: 'Use `/settings` to try linking your account again.' }
        );

      await interaction.reply({
        embeds: [errorEmbed],
        flags: MessageFlags.Ephemeral,
        components: [
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('retryPlexLink')
                .setLabel('Try Again')
                .setStyle(ButtonStyle.Primary)
            )
        ]
      });
      return;
    }

    await settings.handleSettingsUpdate(interaction, { 
      discord_id: interaction.user.id 
    });
  } catch (error) {
    console.error('Error processing Plex username:', error);
    await interaction.reply({
      content: 'An error occurred while processing your request.',
      flags: MessageFlags.Ephemeral
    });
  }
}

export async function handleProfileEditModal(interaction: ModalSubmitInteraction, context: CommandContext) {
  const settings = new SettingsManager(context);
  const alias = interaction.fields.getTextInputValue('alias');
  const email = interaction.fields.getTextInputValue('email');

  await settings.handleSettingsUpdate(interaction, {
    alias: alias || null,
    email: email || null
  });
}