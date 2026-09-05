import type { SystemNotification } from '@root/types/discord.types.js'

export function isSafetyNotification(
  notification: Pick<
    SystemNotification,
    'title' | 'embedFields' | 'safetyTriggered'
  >,
): boolean {
  return (
    notification.embedFields.some((field) => field.name === 'Safety Reason') ||
    notification.title.includes('Safety Triggered') ||
    notification.safetyTriggered === true
  )
}
