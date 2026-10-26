import type {
  DeliveryResult,
  NotificationMessage,
  NotificationUser,
} from '@root/types/notification.types.js'
import type { WebhookEventType } from '@root/types/webhook-endpoint.types.js'
import { errorMessage } from '@utils/error-message.js'
import { recipientLabel } from '@utils/recipient-label.js'
import type { FastifyBaseLogger } from 'fastify'
import { dispatchWebhooks } from './channels/native-webhook.js'
import { ADMIN_CHANNELS, type AdminChannel } from './routing.js'
import { EVENT_LABELS } from './templates/labels.js'
import type {
  AdminNotification,
  AdminRecord,
  DeliveryChannel,
  DeliveryLine,
  DeliveryOutcome,
  NativeWebhook,
  NotificationDeps,
  NotificationRecordInput,
} from './types.js'

export const NOTHING_DELIVERED: DeliveryOutcome = {
  sent_to_discord: false,
  sent_to_apprise: false,
  sent_to_native_webhook: false,
}

const ADMIN_CHANNEL_LABELS: Record<AdminChannel, DeliveryChannel> = {
  discordWebhook: 'Discord webhook',
  discordDm: 'Discord DM',
  apprise: 'Apprise',
}

function logDelivery(
  logger: FastifyBaseLogger,
  line: DeliveryLine,
  channel: DeliveryChannel,
  result: DeliveryResult,
  recipient?: string,
): void {
  const prefix = `${EVENT_LABELS[line.event]}: ${line.summary}. ${channel}`
  const fields = { userId: line.userId, guid: line.guid }
  if (result.ok) {
    const to = recipient ? ` to ${recipient}` : ''
    const handle = result.handle ? ` as @${result.handle}` : ''
    logger.info(fields, `${prefix} sent${to}${handle}`)
    return
  }
  const to = recipient ? ` to ${recipient}` : ''
  logger.warn(fields, `${prefix}${to} failed: ${result.reason}`)
}

/** Never rejects. Logs the one delivery line and resolves whether the message was delivered. */
export async function sendAndLog(
  logger: FastifyBaseLogger,
  line: DeliveryLine,
  channel: DeliveryChannel,
  send: () => Promise<DeliveryResult>,
  recipient?: string,
): Promise<boolean> {
  const result = await send().catch(
    (error): DeliveryResult => ({ ok: false, reason: errorMessage(error) }),
  )
  logDelivery(logger, line, channel, result, recipient)
  return result.ok
}

/** Never rejects. Logs one line per subscribed endpoint and resolves whether any endpoint accepted. */
export async function dispatchNative<E extends WebhookEventType>(
  deps: Pick<NotificationDeps, 'db' | 'logger'>,
  line: DeliveryLine,
  webhook: NativeWebhook<E>,
): Promise<boolean> {
  const { results, succeeded } = await dispatchWebhooks(
    webhook.event,
    webhook.payload,
    deps,
  )
  for (const endpoint of results) {
    logDelivery(
      deps.logger,
      line,
      'Native webhook',
      endpoint.success
        ? { ok: true }
        : { ok: false, reason: endpoint.error ?? 'unknown error' },
      endpoint.endpointName,
    )
  }
  return succeeded > 0
}

async function writeRecord(
  deps: Pick<NotificationDeps, 'db' | 'logger'>,
  record: NotificationRecordInput,
): Promise<void> {
  try {
    await deps.db.createNotificationRecord(record)
  } catch (error) {
    deps.logger.error(
      { error, userId: record.user_id ?? undefined },
      'Failed to record notification',
    )
  }
}

function anyDelivered(outcome: DeliveryOutcome): boolean {
  return Object.values(outcome).some(Boolean)
}

/** Never rejects. Writes the record only when something was delivered and resolves whether anything was. */
export async function recordDelivery(
  deps: Pick<NotificationDeps, 'db' | 'logger'>,
  record: AdminRecord,
  outcome: DeliveryOutcome,
): Promise<boolean> {
  const sent = anyDelivered(outcome)
  if (sent) await writeRecord(deps, { ...record, ...outcome })
  return sent
}

/** Never rejects. Records the event only when an endpoint accepted it. */
export async function dispatchAndRecord<E extends WebhookEventType>(
  deps: Pick<NotificationDeps, 'db' | 'logger'>,
  line: DeliveryLine,
  webhook: NativeWebhook<E>,
  record: AdminRecord,
): Promise<boolean> {
  const sent = await dispatchNative(deps, line, webhook)
  return recordDelivery(deps, record, {
    ...NOTHING_DELIVERED,
    sent_to_native_webhook: sent,
  })
}

/** Never rejects. Sends the DM and Apprise copies the user's own settings ask for. */
export async function sendToUser(
  deps: Pick<NotificationDeps, 'logger' | 'discordBot' | 'apprise'>,
  user: NotificationUser,
  line: DeliveryLine,
  message: Pick<NotificationMessage, 'dm' | 'apprise'>,
): Promise<Pick<DeliveryOutcome, 'sent_to_discord' | 'sent_to_apprise'>> {
  const recipient = recipientLabel(user)
  const userLine = { ...line, userId: user.id }
  const { discord_id: discordId, apprise: appriseUrl } = user
  const [discord, apprise] = await Promise.all([
    user.notify_discord && discordId
      ? sendAndLog(
          deps.logger,
          userLine,
          'Discord DM',
          () => deps.discordBot.sendNotification(discordId, message.dm),
          recipient,
        )
      : false,
    user.notify_apprise && appriseUrl
      ? sendAndLog(
          deps.logger,
          userLine,
          'Apprise',
          () => deps.apprise.sendNotification(appriseUrl, message.apprise),
          recipient,
        )
      : false,
  ])
  return { sent_to_discord: discord, sent_to_apprise: apprise }
}

async function sendToAdminChannel(
  deps: NotificationDeps,
  channel: AdminChannel,
  message: Partial<NotificationMessage>,
  line: DeliveryLine,
): Promise<boolean> {
  const label = ADMIN_CHANNEL_LABELS[channel]
  switch (channel) {
    case 'discordWebhook': {
      const { webhook } = message
      const url = deps.config.discordWebhookUrl
      if (!webhook || !url) return false
      return sendAndLog(deps.logger, line, label, () =>
        deps.discordWebhook.sendNotification(url, webhook),
      )
    }
    case 'discordDm': {
      const { dm } = message
      if (!dm) return false
      const admin = await deps.db.getPrimaryUser()
      const discordId = admin?.discord_id
      if (!admin || !discordId) return false
      return sendAndLog(
        deps.logger,
        line,
        label,
        () => deps.discordBot.sendNotification(discordId, dm),
        recipientLabel(admin),
      )
    }
    case 'apprise': {
      const { apprise } = message
      const url = deps.config.systemAppriseUrl
      if (!apprise || !url) return false
      return sendAndLog(deps.logger, line, label, () =>
        deps.apprise.sendNotification(url, apprise),
      )
    }
  }
}

/** Never rejects. Admin channels follow `setting` and native webhooks always fire. */
export async function deliverToAdmins<E extends WebhookEventType>(
  deps: NotificationDeps,
  notification: Omit<AdminNotification<E>, 'record'>,
): Promise<DeliveryOutcome> {
  const { line, message, webhook } = notification
  const channels = [...ADMIN_CHANNELS[notification.setting]]

  const [sends, native] = await Promise.all([
    Promise.allSettled(
      channels.map((channel) =>
        sendToAdminChannel(deps, channel, message, line),
      ),
    ),
    webhook ? dispatchNative(deps, line, webhook) : false,
  ])

  const delivered = new Set<AdminChannel>()
  sends.forEach((settled, index) => {
    const channel = channels[index]
    if (settled.status === 'fulfilled') {
      if (settled.value) delivered.add(channel)
      return
    }
    logDelivery(deps.logger, line, ADMIN_CHANNEL_LABELS[channel], {
      ok: false,
      reason: errorMessage(settled.reason),
    })
  })

  return {
    sent_to_discord:
      delivered.has('discordWebhook') || delivered.has('discordDm'),
    sent_to_apprise: delivered.has('apprise'),
    sent_to_native_webhook: native,
  }
}

/** Never rejects. Delivers to admins and records what was delivered. */
export async function notifyAdmins<E extends WebhookEventType>(
  deps: NotificationDeps,
  notification: AdminNotification<E>,
): Promise<boolean> {
  const outcome = await deliverToAdmins(deps, notification)
  return notification.record
    ? recordDelivery(deps, notification.record, outcome)
    : anyDelivered(outcome)
}
