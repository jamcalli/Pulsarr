/**
 * Notification Service Module
 *
 * Unified notification system with modular Discord support.
 */

// Channels
export {
  type DiscordDmDeps,
  type DiscordWebhookDeps,
  sendDirectMessage,
  sendDiscordWebhookMediaNotification,
  sendDiscordWebhookPublicNotification,
  sendWebhookNotification,
  validateWebhook,
} from './channels/index.js'
// Discord Bot
export {
  type BotStatus,
  type Command,
  DiscordBotService,
} from './discord-bot/index.js'

// Templates
export {
  COLOR_GREEN,
  COLOR_RED,
  createDeleteSyncEmbed,
  createMediaNotificationEmbed,
  createMediaWebhookPayload,
  createSystemEmbed,
  EMBED_COLOR,
} from './templates/discord-embeds.js'
