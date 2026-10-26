import type { DiscordBotStatus } from '@root/types/notification.types'
import type { StatusPillView } from '@/components/status-pill'
import { DOCS_ROOT } from '@/lib/navigation'

export const DISCORD_DOCS_URL = `${DOCS_ROOT}/notifications/discord#user-notification-setup`

export const BOT_STATUS_PILLS: Record<DiscordBotStatus, StatusPillView> = {
  running: { tone: 'on', label: 'Running' },
  starting: { tone: 'pending', label: 'Starting' },
  stopping: { tone: 'pending', label: 'Stopping' },
  stopped: { tone: 'off', label: 'Stopped' },
}

/** Why the test direct message cannot send, null while the bot runs. */
export function dmUnavailableReason(
  status: DiscordBotStatus | null,
): string | null {
  if (status === 'running') return null
  if (status === 'starting') return 'Wait for the bot to finish starting.'
  return 'Start the bot to send direct messages.'
}

/** The running bot holds the token it started with, so an unsaved credential edit needs a restart to apply. */
export function botRestartNeeded(
  status: DiscordBotStatus | null,
  credentialsDirty: boolean,
): boolean {
  return credentialsDirty && (status === 'running' || status === 'starting')
}
